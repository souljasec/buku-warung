// Read-only checks of a deployment. Never writes to the book: the PUTs below are built to be rejected.
//   node scripts/smoke.mjs https://buku.<your-name>.workers.dev <sync code>
const [base = 'http://127.0.0.1:8787', code = process.env.SYNC_TOKEN || ''] = process.argv.slice(2);
const url = p => new URL(p, base.endsWith('/') ? base : base + '/').href;
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); if (!ok) failed++; };
const auth = c => ({ authorization: `Bearer ${c}` });

for (const p of ['', 'app.js', 'logic.js', 'i18n.js', 'style.css', 'sw.js', 'manifest.webmanifest', 'icons/icon-192.png']) {
  const r = await fetch(url(p));
  check(`serves /${p}`, r.status === 200, r.status);
}
for (const p of ['_seed.json', '_seed.html', 'logic.test.mjs', '.dev.vars', 'wrangler.jsonc', 'worker/index.js']) {
  const r = await fetch(url(p));
  check(`hides /${p}`, r.status === 404, r.status);
}

const home = await fetch(url(''));
const csp = home.headers.get('content-security-policy') || '';
check('CSP: script-src self only', /script-src 'self'(;|$)/.test(csp), csp ? 'set' : 'missing');
check("CSP: frame-ancestors 'none'", csp.includes("frame-ancestors 'none'"));
check("CSP: connect-src 'self'", csp.includes("connect-src 'self'"));
check('nosniff', home.headers.get('x-content-type-options') === 'nosniff');
check('no referrer', home.headers.get('referrer-policy') === 'no-referrer');
const sw = await (await fetch(url('sw.js'))).text();
check('offline cache version stamped', !/VERSION = 'dev'/.test(sw), (sw.match(/VERSION = '([^']*)'/) || [])[1]);

const api = url('api/book');
check('API without code → 401', (await fetch(api)).status === 401);
check('API with wrong code → 401', (await fetch(api, { headers: auth('0'.repeat(64)) })).status === 401);
check('API wrong code of other length → 401', (await fetch(api, { headers: auth('x') })).status === 401);
check('API no CORS for other sites', !(await fetch(api, { headers: { origin: 'https://evil.example' } })).headers.get('access-control-allow-origin'));
check('unauthorized PUT → 401', (await fetch(api, { method: 'PUT', body: '{"v":1,"moves":[],"categories":[]}' })).status === 401);

if (code) {
  const r = await fetch(api, { headers: auth(code) });
  const d = r.status === 200 ? await r.json() : {};
  check('API with code → 200', r.status === 200, r.status);
  check('cloud book readable', r.status === 200, d.book ? `version ${d.version}, ${d.book.moves.length} expenses` : 'empty: new install');
  check('no-store on book', (r.headers.get('cache-control') || '').includes('no-store'));
  const stale = await fetch(api, { method: 'PUT', headers: { ...auth(code), 'if-match': String((d.version || 0) + 999) }, body: '{}' });
  check('stale write refused → 409 (nothing written)', stale.status === 409, stale.status);
  const junk = await fetch(api, { method: 'PUT', headers: { ...auth(code), 'if-match': String(d.version || 0) }, body: '{"v":1}' });
  check('non-book write refused → 400 (nothing written)', junk.status === 400, junk.status);
  const after = await (await fetch(api, { headers: auth(code) })).json();
  check('book unchanged by the smoke test', after.version === d.version, `version ${after.version}`);
  check('DELETE not allowed → 405', (await fetch(api, { method: 'DELETE', headers: auth(code) })).status === 405);
} else {
  console.log('SKIP  authorized checks (no code given)');
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
