// End-to-end: drives the real app in headless Chrome against a LOCAL worker (it writes test data to the book).
//   npx wrangler dev --local --port 8787      (with SYNC_TOKEN in .dev.vars)
//   node scripts/e2e.mjs [http://127.0.0.1:8787] [code]       CHROME=/path/to/chrome to override
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '') + '/';
const CODE = process.argv[3] || (readFileSync('.dev.vars', 'utf8').match(/SYNC_TOKEN=(\S+)/) || [])[1];
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(BASE)) { console.error('e2e writes test data: local worker only'); process.exit(2); }
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? `  (${detail})` : ''}`); if (!ok) failed++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const api = (method, body, version) => fetch(BASE + 'api/book', {
  method, body, headers: { authorization: `Bearer ${CODE}`, ...(method === 'PUT' ? { 'if-match': String(version) } : {}) },
}).then(r => r.json());
const today = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date());

// a known starting book in the local cloud
const seed = { v: 1, categories: [{ id: 'c1', name_id: 'Belanja pasar', name_en: 'Market', keywords: 'ayam', active: true },
  { id: 'c2', name_id: 'Gas', name_en: 'Gas', keywords: 'gas', active: true }],
  moves: [{ id: 'm1', day: today, amount: 50000, kind: 'expense', paid: 'cash', cat: 'c1', note: 'seed ayam' }],
  counts: {}, menu: [], tally: {}, salesTotals: {}, settings: { lang: 'id', lastBackup: null } };
const before = await api('GET');
const seeded = await api('PUT', JSON.stringify(seed), before.version);
check('seed local cloud', seeded.version === before.version + 1, `version ${seeded.version}`);

// ---------- chrome over CDP ----------
const dir = mkdtempSync(join(tmpdir(), 'warung-e2e-'));
const chrome = spawn(CHROME, ['--headless=new', `--user-data-dir=${dir}`, '--remote-debugging-port=9334', 'about:blank'], { stdio: 'ignore' });
let ver;
for (let i = 0; i < 40 && !ver; i++) { await wait(250); ver = await fetch('http://127.0.0.1:9334/json/version').then(r => r.json()).catch(() => null); }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pending = {}; const consoleErrors = [];
const send = (method, params = {}, sessionId) => new Promise(res => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pending[d.id]) pending[d.id](d.result || d.error);
  if (d.method === 'Runtime.exceptionThrown') consoleErrors.push(d.params.exceptionDetails.exception?.description || 'exception');
  // the wrong-code device gets an expected 401; anything else (CSP violations, script errors) fails the run
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/status of 401/.test(d.params.entry.text)) consoleErrors.push(d.params.entry.text);
};
await new Promise(r => { ws.onopen = r; });

async function page() {
  const { browserContextId } = await send('Target.createBrowserContext');  // isolated storage = a separate device
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  for (const m of ['Runtime.enable', 'Log.enable', 'Page.enable']) await send(m, {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  const js = async expr => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
    return r.result?.value;
  };
  const offline = on => send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);
  await send('Network.enable', {}, sessionId);
  return { go: async (url, ms = 1500) => { await send('Page.navigate', { url }, sessionId); await wait(ms); }, js, offline };
}
const text = sel => `return [...document.querySelectorAll(${JSON.stringify(sel)})].map(e => e.textContent.trim())`;

try {
  // device A: connect link
  const A = await page();
  await A.go(BASE + '#sync=' + CODE, 2500);
  check('connect link removes the code from the address bar', !(await A.js('return location.href')).includes(CODE));
  await A.js(`location.hash = '#/m/${today.slice(0, 7)}/d/${today}'`); await wait(500);
  check('cloud book downloaded (seed expense visible)', (await A.js(text('.moves .mnote'))).includes('seed ayam'));

  // keypad + XSS note
  const evil = '<img src=x onerror="window.__xss=1">';
  await A.js(`document.querySelector('#fab').click()`); await wait(300);
  await A.js(`for (const k of ['7','6']) document.querySelector('[data-k="'+k+'"]').click()`);
  check('keypad: 76 shows Rp 76.000', (await A.js(`return document.querySelector('.kpamt').textContent`)).includes('76.000'));
  await A.js(`const n = document.querySelector('.kpnote'); n.value = ${JSON.stringify(evil)}; document.querySelector('.kp').requestSubmit()`); await wait(400);
  await A.js(`document.querySelector('[data-action=kp-close]').click()`); await wait(400);
  check('keypad saved the expense', (await A.js(text('.moves .amt'))).includes('Rp 76.000'));
  check('long note does not push buttons off screen', await A.js(`const d = document.querySelector('#day'), b = document.querySelector('.bhead .btn').getBoundingClientRect();
    return d.scrollWidth <= d.clientWidth && b.right <= innerWidth && [...document.querySelectorAll('.moves select')].every(e => e.getBoundingClientRect().right <= innerWidth)`));
  check('XSS note shown as text, not executed', (await A.js(text('.moves .mnote'))).includes(evil) && !(await A.js('return window.__xss')));

  // big amount warning
  await A.js(`document.querySelector('#fab').click()`); await wait(300);
  await A.js(`for (const k of ['5','0','0','0']) document.querySelector('[data-k="'+k+'"]').click()`);
  check('5000 in keypad = Rp 5.000.000 and is flagged', (await A.js(`return document.querySelector('.kpamt').textContent`)).includes('5.000.000')
    && await A.js(`return document.querySelector('.kphint').classList.contains('big')`));
  await A.js(`document.querySelector('[data-action=kp-close]').click()`); await wait(300);

  // paste, then the same paste again
  const pasteIt = `const d = document.querySelector('details.block:has(form[data-action=paste])'); d.open = true;
    const f = d.querySelector('form'); f.text.value = '35 gas\\n20 es batu\\nkas 1300'; f.requestSubmit()`;
  const count = () => A.js(`return document.querySelectorAll('.moves.out li').length`);
  const n0 = await count();
  await A.js(pasteIt); await wait(500);
  const n1 = await count();
  check('paste adds 2 expenses', n1 === n0 + 2, `${n0} → ${n1}`);
  check('paste kas 1300 sets cash Rp 1.300.000', await A.js(`return document.querySelector('input[name=cash]').value`) === '1.300.000');
  await A.js(pasteIt); await wait(500);
  check('same paste again is skipped', await count() === n1, `${await count()} expenses`);
  check('…and says so', (await A.js(`return document.querySelector('#toast').textContent`)).includes('sudah ditempel'));

  // count typed in thousands
  await A.js(`const f = document.querySelector('form[data-action=count]'); f.cash.value = '1450'; f.qris.value = '120'; f.requestSubmit()`); await wait(500);
  check('cash count 1450 = Rp 1.450.000', await A.js(`return document.querySelector('input[name=cash]').value`) === '1.450.000');
  check('QRIS 120 = Rp 120.000', await A.js(`return document.querySelector('input[name=qris]').value`) === '120.000');

  // sales: + button → Masuk, several entries a day; recorded sales win over the money count
  const salesLine = () => A.js(`return document.querySelector('.day .vsplit').textContent`);
  const addSale = async (keys, via) => {
    await A.js(`document.querySelector('#fab').click()`); await wait(300);
    await A.js(`document.querySelector('[data-action=kp-mode][data-mode=in]').click()`); await wait(200);
    await A.js(`for (const k of ${JSON.stringify(keys)}) document.querySelector('[data-k="'+k+'"]').click();
      document.querySelector('[data-action=kp-via][data-via=${via}]').click()`); await wait(200);
    await A.js(`document.querySelector('.kp').requestSubmit()`); await wait(300);
    await A.js(`document.querySelector('[data-action=kp-close]').click()`); await wait(400);
  };
  await A.js(`document.querySelector('#fab').click()`); await wait(300);
  await A.js(`document.querySelector('[data-action=kp-mode][data-mode=in]').click()`); await wait(200);
  check('keypad has a Masuk (money in) mode with Tunai / QRIS / GoFood', await A.js(`return document.querySelectorAll('[data-action=kp-via]').length === 3 && !document.querySelector('[data-action=kp-cat]')`));
  await A.js(`document.querySelector('[data-action=kp-close]').click()`); await wait(300);
  await addSale(['1', '5', '0', '0'], 'bank');
  check('sale 1500 via QRIS = Rp 1.500.000 in money in', (await A.js(text('.moves .amt'))).includes('Rp 1.500.000') && (await A.js(text('.pill.sale'))).includes('QRIS / transfer'));
  check('recorded sale replaces the money-count sales for the day', (await salesLine()).includes('Rp 1.500.000'));
  await addSale(['7', '0', '0'], 'cash');
  check('two sales add up to Rp 2.200.000', (await salesLine()).includes('Rp 2.200.000'));
  check('sales are not counted as spending', !(await A.js(`return document.querySelector('.day .vsplit').textContent`)).includes('Pengeluaran Rp 2.'));
  await A.js(`[...document.querySelectorAll('.moves li')].find(li => li.textContent.includes('Rp 700.000')).querySelector('[data-action=move-del]').click()`); await wait(400);
  check('deleting a sale updates the day', (await salesLine()).includes('Rp 1.500.000'));

  // reload keeps everything
  await A.go(BASE + `#/m/${today.slice(0, 7)}/d/${today}`, 2000);
  check('data survives reload', (await count()) === n1 && (await A.js(text('.moves .mnote'))).includes(evil));

  // sync to the cloud, then a second device
  await A.go(BASE + '#/more', 1500);
  await A.js(`document.querySelector('[data-action=sync]').click()`); await wait(1500);
  const cloud = await api('GET');
  check('sync uploaded device A changes', cloud.version > seeded.version && cloud.book.moves.some(m => m.note === evil), `version ${cloud.version}`);
  const B = await page();
  await B.go(BASE + '#sync=' + CODE, 2500);
  await B.js(`location.hash = '#/m/${today.slice(0, 7)}/d/${today}'`); await wait(500);
  check('device B sees device A data', (await B.js(text('.moves .mnote'))).includes(evil) && !(await B.js('return window.__xss')));

  // offline at the market: reload without network, record, come back online
  await A.offline(true);
  await A.go(BASE + `#/m/${today.slice(0, 7)}/d/${today}`, 2000);
  check('offline: app opens from the offline cache with data', (await A.js(text('.moves .mnote'))).includes('seed ayam'));
  await A.js(`document.querySelector('#fab').click()`); await wait(300);
  await A.js(`for (const k of ['4','2']) document.querySelector('[data-k="'+k+'"]').click(); document.querySelector('.kpnote').value = 'offline es'; document.querySelector('.kp').requestSubmit()`); await wait(400);
  await A.js(`document.querySelector('[data-action=kp-close]').click()`); await wait(300);
  check('offline: expense recorded as money out (+ opens on Keluar even after a sale)', (await A.js(text('.moves.out .mnote'))).includes('offline es'));
  await A.offline(false);
  await A.js(`window.dispatchEvent(new Event('online'))`); await wait(2000);
  check('back online: offline expense reaches the cloud', (await api('GET')).book.moves.some(m => m.note === 'offline es' && m.kind === 'expense'));

  // wrong code on a third device
  const C = await page();
  await C.go(BASE + '#sync=wrongwrongwrongwrongwrong0', 2500);
  await C.go(BASE + '#/more', 1200);
  check('wrong code: device stays empty and offers to connect again', await C.js(`return Boolean(document.querySelector('form[data-action=sync-on]'))`)
    && await C.js(`return !document.body.textContent.includes('seed ayam')`));

  check('no CSP violations or script errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('e2e run', false, e.message);
} finally {
  ws.close();
  chrome.kill();
  await wait(300);
  rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall e2e checks passed');
process.exit(failed ? 1 : 0);
