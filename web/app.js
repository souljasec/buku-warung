import { TEXTS } from './i18n.js';
import {
  newState, uid, parseWA, money, amountIn, isDuplicatePaste, syncDecision, guessCategory, salesByDay, expensesByDay, monthSum,
  isoDay, shiftMonth, rp, fromBackup,
} from './logic.js';

// ---------- storage: the whole book is one small JSON document in IndexedDB ----------
// ponytail: one document rewritten per change; fine for years of a warung (~1 MB), split per record if it ever isn't

const DB_NAME = 'pembukuan-warung', STORE = 'kv';
let dbp = null;
const idb = () => dbp ??= new Promise((res, rej) => {
  const r = indexedDB.open(DB_NAME, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function load() {
  const db = await idb();
  return new Promise((res, rej) => {
    const q = db.transaction(STORE).objectStore(STORE).get('state');
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
let writing = Promise.resolve();
function save() {
  const snapshot = JSON.parse(JSON.stringify(S));
  writing = writing.then(async () => {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(snapshot, 'state');
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }).catch(() => toast(t('storage') + ': error'));
  markDirty();
}

// ---------- cloud copy (optional): the same JSON in Workers KV, see worker/index.js ----------
// The token lives in localStorage, never inside the book, so backups and the cloud copy don't carry it.

const SYNC_KEY = 'pw-sync';
const sync = (() => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch { return {}; } })();
const saveSync = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch { /* private mode */ } };
let syncTimer, syncing = false;

function markDirty() {
  if (!sync.token) return;
  sync.dirty = true;
  saveSync();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(), 30_000);  // ponytail: batch quick edits into one KV write; far below 1.000/day for one warung
}

async function api(method, body) {
  const res = await fetch('api/book', {
    method, body, cache: 'no-store',
    headers: { authorization: `Bearer ${sync.token}`, ...(method === 'PUT' ? { 'if-match': String(sync.version || 0), 'content-type': 'application/json' } : {}) },
  });
  if (res.status === 401) {
    if (!sync.last) { for (const k of Object.keys(sync)) delete sync[k]; saveSync(); render(); }  // never worked: a typo, forget it
    throw new Error(t('syncBadToken'));
  }
  if (res.status !== 200 && res.status !== 409) throw new Error(t('syncOffline'));
  return { status: res.status, data: await res.json() };
}

async function syncNow(manual = false) {
  if (!sync.token || syncing || !navigator.onLine) { if (manual && !navigator.onLine) toast(t('syncOffline')); return; }
  syncing = true;
  clearTimeout(syncTimer);
  try {
    const { data: cloud } = await api('GET');
    let act = syncDecision({ cloudVersion: cloud.version, cloudHasBook: Boolean(cloud.book), localVersion: sync.version || 0, dirty: Boolean(sync.dirty) });
    if (act === 'stale') return;  // edge cache still has an older copy; try again on the next sync
    if (act === 'ask') act = confirm(t('syncConflict')) ? 'take' : 'push';
    if (act === 'take') {
      S = fromBackup(cloud.book);
      await writing;
      writing = writing.then(() => idb()).then(db => new Promise(res => {
        const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(S, 'state'); tx.oncomplete = res;
      }));
      Object.assign(sync, { version: cloud.version, dirty: false });
    } else if (act === 'push') {
      sync.version = cloud.version;  // this device wins: write over what the cloud has
      const { status, data } = await api('PUT', JSON.stringify(S));
      if (status === 409) { sync.version = -1; throw new Error(t('syncRetry')); }
      Object.assign(sync, { version: data.version, dirty: false });
    }
    sync.last = new Date().toISOString();
    saveSync();
    render();
    if (manual) toast(t('syncDone'));
  } catch (e) {
    if (manual) toast(e.message);
  } finally {
    syncing = false;
  }
}

// ---------- helpers ----------

let S = newState();
const T = () => TEXTS[S.settings.lang] || TEXTS.id;
const t = k => T()[k];
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const num = v => v == null ? '' : Number(v).toLocaleString('id-ID');
const todayISO = () => isoDay(new Date());
const catName = c => c ? (S.settings.lang === 'en' ? c.name_en : c.name_id) : t('kindExpense');
const catById = id => S.categories.find(c => c.id === id);
const wide = matchMedia('(min-width: 960px)');

function monthTitle(month, short = false) {
  const [y, m] = month.split('-').map(Number);
  return `${T()[short ? 'monthsShort' : 'months'][m - 1]} ${short ? String(y).slice(2) : y}`;
}
function dayTitle(day) {
  const d = new Date(day + 'T00:00');
  return `${T().weekdaysLong[(d.getDay() + 6) % 7]}, ${d.getDate()} ${T().monthsShort[d.getMonth()]} ${d.getFullYear()}`;
}

let toastTimer;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button type="button" data-action="undo">${S.settings.lang === 'en' ? 'Undo' : 'Batalkan'}</button>` : ''}`;
  el.classList.add('on');
  toast.undo = undo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), undo ? 6000 : 2600);
}

// ---------- routing: #/m/2025-11[/d/2025-11-03], #/r/2025-11, #/menu, #/more ----------

function dataMonths() {
  const s = new Set();
  for (const d of Object.keys(salesByDay(S))) s.add(d.slice(0, 7));
  for (const m of S.moves) s.add(m.day.slice(0, 7));
  return s;
}
function defaultMonth() {
  const now = todayISO().slice(0, 7), months = dataMonths();
  return months.has(now) || !months.size ? now : [...months].sort().pop();
}
function route() {
  const [view = 'm', month, d, day] = location.hash.replace(/^#\/?/, '').split('/');
  const ok = /^\d{4}-\d{2}$/.test(month || '');
  return { view, month: ok ? month : defaultMonth(), day: d === 'd' && /^\d{4}-\d{2}-\d{2}$/.test(day || '') ? day : null };
}
const go = hash => { location.hash = hash; };

// ---------- verdict: one big ▲/▼ profit, used by month, day and reports ----------

function verdictHTML(label, sales, exp, opts = {}) {
  const has = sales || exp, p = sales - exp, dir = p >= 0 ? 'up' : 'down';
  const warn = sales > 0 && !exp ? t('noSpend') : opts.warn;
  return `<section class="verdict ${has ? dir : 'none'}" aria-live="polite">
    <p class="vlabel">${label}</p>
    <p class="vnum">${has ? icon(dir, 'vmark') : ''}<span>${has ? rp(p) : '—'}</span></p>
    <p class="vsub">${has ? `${t(dir)}${sales ? ` · ${t('margin')} ${Math.round(p * 100 / sales)}%` : ''}` : t('noData')}</p>
    ${has && warn ? `<p class="vwarn">${warn}</p>` : ''}
    <p class="vsplit"><span>${t('sales')} <b>${rp(sales)}</b>${opts.tag || ''}</span><span>${t('expenses')} <b>${rp(exp)}</b></span>${opts.more || ''}</p>
    ${opts.strip || ''}
  </section>`;
}

/** Day cell amount: thousands without a unit (490 = Rp 490.000), millions as 1,2jt. */
function cellAmt(v) {
  const a = Math.abs(v);
  return a >= 1e6 ? (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + 'jt' : String(Math.max(1, Math.round(a / 1e3)));
}

// ---------- month (home) ----------

function renderMonth(R) {
  const sales = salesByDay(S), exp = expensesByDay(S);
  const sm = monthSum(sales, R.month), em = monthSum(exp, R.month), profit = sm - em;
  const has = sm || em;
  const [y, m] = R.month.split('-').map(Number);
  const first = (new Date(y, m - 1, 1).getDay() + 6) % 7, days = new Date(y, m, 0).getDate();
  const today = todayISO(), selected = selectedDay(R);

  // 12-month strip: profit per month, tap to jump
  const strip = Array.from({ length: 12 }, (_, i) => shiftMonth(R.month, i - 11)).map(mo => ({ mo, s: monthSum(sales, mo), e: monthSum(exp, mo) })).map(x => ({ ...x, p: x.s - x.e, inc: x.s > 0 && !x.e }));
  const maxP = Math.max(1, ...strip.map(s => Math.abs(s.p)));

  let cells = '';
  for (let i = 0; i < first; i++) cells += '<span class="cell pad" aria-hidden="true"></span>';
  for (let dd = 1; dd <= days; dd++) {
    const day = `${R.month}-${String(dd).padStart(2, '0')}`;
    const s = sales[day] || 0, e = exp[day] || 0, net = s - e, any = s || e;
    const cls = ['cell', any ? (net >= 0 ? 'up' : 'down') : '', day === today ? 'today' : '', day === selected ? 'sel' : '', day > today ? 'future' : ''].join(' ');
    const label = `${dd} ${T().monthsShort[m - 1]}: ` + (any ? `${t(net >= 0 ? 'up' : 'down')} ${rp(net)}` : t('noData'));
    cells += `<a class="${cls}" href="#/m/${R.month}/d/${day}" aria-label="${esc(label)}">
      <b>${dd}</b>${any ? `<span class="net">${icon(net >= 0 ? 'up' : 'down', 'mark')}${cellAmt(net)}</span>` : ''}</a>`;
  }

  const hasRent = S.moves.some(mv => mv.day.startsWith(R.month) && /sewa|rent/i.test(catById(mv.cat)?.name_id || ''));
  const backupDue = !sync.token && (S.moves.length || Object.keys(S.counts).length) &&
    (!S.settings.lastBackup || Date.now() - new Date(S.settings.lastBackup) > 7 * 864e5);
  const tS = sales[today] || 0, tE = exp[today] || 0;
  const first_run = !S.moves.length && !Object.keys(S.counts).length && !Object.keys(S.salesTotals).length;

  return `
  <header class="mhead">
    <a class="iconbtn" href="#/m/${shiftMonth(R.month, -1)}" aria-label="${t('prev')}">${icon('left')}</a>
    <h1>${monthTitle(R.month)}</h1>
    <a class="iconbtn" href="#/m/${shiftMonth(R.month, 1)}" aria-label="${t('next')}">${icon('right')}</a>
  </header>

  ${verdictHTML(t('profitMonth'), sm, em, {
    warn: !hasRent ? `${t('missingFixedShort')} <button type="button" class="link" data-action="keypad">${t('addCost')}</button>` : '',
    strip: `<nav class="strip" aria-label="${t('trend')}">
      ${strip.map(x => `<a href="#/m/${x.mo}" class="${x.mo === R.month ? 'cur' : ''} ${x.p < 0 ? 'neg' : ''} ${x.inc ? 'inc' : ''}" aria-label="${monthTitle(x.mo)}: ${rp(x.p)}${x.inc ? ' (' + t('noSpend') + ')' : ''}">
        <i style="--h:${Math.round(Math.abs(x.p) / maxP * 100)}%"></i><small>${T().monthsShort[Number(x.mo.slice(5)) - 1][0]}</small></a>`).join('')}
    </nav>`,
  })}

  ${first_run ? `<section class="note welcome"><h2>${t('welcome')}</h2><p>${t('welcomeText')}</p>
    <a class="btn" href="#/m/${today.slice(0, 7)}/d/${today}">${t('startToday')}</a></section>` : ''}

  <section class="cal" aria-label="${monthTitle(R.month)}">
    <div class="wk">${T().weekdays.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="grid">${cells}</div>
  </section>
  ${backupDue ? `<p class="note">${t('backupDue')} <button type="button" class="link" data-action="backup">${t('backupNow')}</button></p>` : ''}

  <a class="todaybar" href="#/m/${today.slice(0, 7)}/d/${today}">
    <span class="tlabel">${t('today')}</span>
    <span><small>${t('sales')}</small> ${rp(tS)}</span>
    <span><small>${t('expenses')}</small> ${rp(tE)}</span>
    ${icon('right')}
  </a>`;
}

function selectedDay(R) {
  if (R.day) return R.day;
  const today = todayISO();
  return today.startsWith(R.month) ? today : `${R.month}-01`;
}

// ---------- day sheet / panel ----------

function renderDay(day) {
  const sales = salesByDay(S)[day] || 0;
  const dayMoves = S.moves.filter(m => m.day === day);
  const ins = dayMoves.filter(m => m.kind === 'sale'), moves = dayMoves.filter(m => m.kind !== 'sale');
  const exp = moves.filter(m => m.kind === 'expense').reduce((a, m) => a + m.amount, 0);
  const pers = moves.filter(m => m.kind === 'personal').reduce((a, m) => a + m.amount, 0);
  const c = S.counts[day] || {};
  const firstCount = !Object.keys(S.counts).some(d => d < day && S.counts[d].cash != null);
  const cats = S.categories.filter(x => x.active);
  const items = S.menu.filter(i => i.active || S.tally[day]?.[i.id]);
  const groups = {};
  for (const i of items) (groups[i.group || '—'] ??= []).push(i);
  const tallyValue = Object.values(S.tally[day] || {}).reduce((a, x) => a + x.qty * x.price, 0);
  const prev = isoDay(new Date(new Date(day + 'T00:00').getTime() - 864e5));
  const next = isoDay(new Date(new Date(day + 'T00:00').getTime() + 864e5));

  return `
  <header class="dhead">
    <a class="iconbtn" href="#/m/${prev.slice(0, 7)}/d/${prev}" aria-label="${t('prev')}">${icon('left')}</a>
    <h2>${dayTitle(day)}</h2>
    <a class="iconbtn" href="#/m/${next.slice(0, 7)}/d/${next}" aria-label="${t('next')}">${icon('right')}</a>
    <button type="button" class="iconbtn closer" data-action="close-day" aria-label="${t('close')}">${icon('x')}</button>
  </header>

  ${verdictHTML(t('profitDay'), sales, exp, {
    tag: !ins.length && S.counts[day] && S.salesTotals[day] == null ? ` <span class="pill">${t('fromCount')}</span>` : '',
    more: pers ? `<span>${t('personal')} <b>${rp(pers)}</b></span>` : '',
  })}

  <section class="block">
    <div class="bhead"><h3>${t('moneyIn')}</h3>
      <button type="button" class="btn small" data-action="keypad" data-mode="in" data-day="${day}">${icon('plus')}${t('add')}</button></div>
    ${ins.length || S.salesTotals[day] != null ? `<ul class="moves in">
      ${S.salesTotals[day] != null ? `<li><span class="amt">${rp(S.salesTotals[day])}</span><span class="mnote">${t('dailyTotal')}</span>
        <button type="button" class="iconbtn small" data-action="total-del" data-day="${day}" aria-label="${t('delete')}">${icon('trash')}</button></li>` : ''}
      ${ins.map(mv => `<li>
        <span class="amt">${rp(mv.amount)}</span>
        <span class="mnote">${esc(mv.note)}</span>
        <span class="pill sale">${t({ cash: 'viaCash', bank: 'viaBank', gofood: 'viaGofood' }[mv.paid])}</span>
        <button type="button" class="iconbtn small" data-action="move-del" data-id="${mv.id}" aria-label="${t('delete')}">${icon('trash')}</button>
      </li>`).join('')}</ul>` : `<p class="empty">${t('noSales')}</p>`}
  </section>

  <section class="block">
    <div class="bhead"><h3>${t('moneyOut')}</h3>
      <button type="button" class="btn small amber" data-action="keypad" data-mode="out" data-day="${day}">${icon('plus')}${t('add')}</button></div>
    ${moves.length ? `<ul class="moves out">${moves.map(mv => `
      <li>
        <span class="amt">${rp(mv.amount)}</span>
        <span class="mnote">${esc(mv.note)}</span>
        ${mv.kind === 'expense'
          ? `<select data-action="move-cat" data-id="${mv.id}" aria-label="${esc(catName(catById(mv.cat)))}">${(cats.some(x => x.id === mv.cat) || !catById(mv.cat) ? cats : [...cats, catById(mv.cat)]).map(x => `<option value="${x.id}" ${x.id === mv.cat ? 'selected' : ''}>${esc(catName(x))}</option>`).join('')}</select>`
          : `<span class="pill ${mv.kind}">${t(mv.kind === 'personal' ? 'kindPersonal' : 'kindCapital')}</span>`}
        ${mv.paid === 'bank' ? `<span class="pill">${t('paidBank')}</span>` : ''}
        <button type="button" class="iconbtn small" data-action="move-del" data-id="${mv.id}" aria-label="${t('delete')}">${icon('trash')}</button>
      </li>`).join('')}</ul>` : `<p class="empty">${t('nothing')}</p>`}
  </section>

  <details class="block" ${S.counts[day] ? 'open' : ''}>
    <summary><h3>${t('stepCount')} <small>${t('optional')}</small></h3>${icon('right', 'chev')}</summary>
    <form data-action="count" data-day="${day}" class="stack">
    <p class="hint">${t('countHelp')}</p>
    ${firstCount ? `<p class="note">${t('firstCount')}</p>` : ''}
    <label>${t('cash')}<input name="cash" data-amount inputmode="numeric" autocomplete="off" placeholder="1.300.000" value="${num(c.cash)}"></label>
    <div class="two">
      <label>${t('qris')}<input name="qris" data-amount inputmode="numeric" autocomplete="off" placeholder="0" value="${c.qris ? num(c.qris) : ''}"></label>
      <label>${t('gofood')}<input name="gofood" data-amount inputmode="numeric" autocomplete="off" placeholder="0" value="${c.gofood ? num(c.gofood) : ''}"></label>
    </div>
    <button class="btn">${t('save')}</button>
    </form>
  </details>

  <details class="block">
    <summary><h3>${t('stepPaste')}</h3>${icon('right', 'chev')}</summary>
    <p class="hint">${t('pasteHelp')}</p>
    <ul class="codes">${T().codes.map(([k, v]) => `<li><code>${k}</code> ${v}</li>`).join('')}</ul>
    <form data-action="paste" data-day="${day}">
      <textarea name="text" rows="5" placeholder="${esc(t('pastePh'))}" aria-label="${t('stepPaste')}"></textarea>
      <button class="btn">${t('pasteBtn')}</button>
    </form>
  </details>

  <details class="block">
    <summary><h3>${t('stepSold')} <small>${t('optional')}</small></h3>${icon('right', 'chev')}</summary>
    <p class="hint">${t('soldHelp')}</p>
    ${items.length ? `<form data-action="tally" data-day="${day}">
      ${Object.entries(groups).map(([g, list]) => `<h4>${esc(g)}</h4><div class="tally">${list.map(i => {
        const row = S.tally[day]?.[i.id];
        return `<label class="titem ${row ? 'has' : ''}"><span>${esc(i.name)}<small>${rp(row?.price ?? i.price)}</small></span>
          <input name="${i.id}" type="number" min="0" inputmode="numeric" value="${row?.qty ?? ''}" placeholder="0" aria-label="${esc(i.name)}"></label>`;
      }).join('')}</div>`).join('')}
      <div class="row"><span class="hint">${rp(tallyValue)}</span><button class="btn">${t('save')}</button></div>
    </form>` : `<p class="empty">${t('noMenu')} <a href="#/menu">${t('toMenu')}</a></p>`}
  </details>`;
}

// ---------- keypad (market moment) ----------

// same rule as WhatsApp notes: under 10.000 means thousands (76 -> Rp 76.000)
const BIG = 2_000_000;  // amounts this large are usually a typo (5000 meant as Rp 5.000) or rent: show a check
const padAmount = () => { const v = Number(pad.digits || 0); return v < 10000 ? v * 1000 : v; };
const pad = { day: null, mode: 'out', via: 'cash', digits: '', cat: null, catTouched: false, personal: false, qris: false, saved: 0 };

function topCategories() {
  const use = {};
  for (const m of S.moves) if (m.cat) use[m.cat] = (use[m.cat] || 0) + 1;
  return S.categories.filter(c => c.active).sort((a, b) => (use[b.id] || 0) - (use[a.id] || 0));
}
function openKeypad(day, mode) {
  // always opens on Keluar (the market moment) unless a money-in button asked for Masuk: never on the last-used mode
  Object.assign(pad, { day: day || todayISO(), mode: mode === 'in' ? 'in' : 'out', via: 'cash', digits: '', catTouched: false, personal: false, qris: false, saved: 0, cat: topCategories()[0]?.id });
  renderKeypad();
  $('#keypad').showModal();
}
function renderKeypad() {
  const cats = topCategories();
  const shown = cats.slice(0, 6);
  if (pad.cat && !shown.some(c => c.id === pad.cat)) shown[5] = catById(pad.cat);
  const amount = padAmount(), isIn = pad.mode === 'in', big = !isIn && amount >= BIG;
  $('#keypad').innerHTML = `
  <form method="dialog" class="kp ${isIn ? 'in' : 'out'}" data-action="kp-save">
    <header><span class="hint">${dayTitle(pad.day)}</span>
      <button type="button" class="iconbtn" data-action="kp-close" aria-label="${t('close')}">${icon('x')}</button></header>
    <div class="seg kpmode" role="group" aria-label="${t('addSpend')}">
      <button type="button" data-action="kp-mode" data-mode="out" aria-pressed="${!isIn}">${t('kpOut')}</button>
      <button type="button" data-action="kp-mode" data-mode="in" aria-pressed="${isIn}">${t('kpIn')}</button>
    </div>
    <output class="kpamt ${amount ? '' : 'zero'}" aria-live="polite">${rp(amount)}</output>
    <p class="hint kphint ${big ? 'big' : ''}">${big ? t('bigAmount') : t(isIn ? 'kpInHint' : 'kpHint')}</p>
    ${isIn ? `<div class="chips" role="group" aria-label="${t('moneyIn')}">
      ${['cash', 'bank', 'gofood'].map(v => `<button type="button" class="chip ${pad.via === v ? 'on' : ''}" data-action="kp-via" data-via="${v}" aria-pressed="${pad.via === v}">${t({ cash: 'viaCash', bank: 'viaBank', gofood: 'viaGofood' }[v])}</button>`).join('')}
    </div>
    <input class="kpnote" name="note" placeholder="${t('saleNote')}" autocomplete="off" aria-label="${t('note')}">` : `
    <div class="chips" role="group" aria-label="${t('categories')}">
      ${shown.map(c => `<button type="button" class="chip ${c.id === pad.cat && !pad.personal ? 'on' : ''}" data-action="kp-cat" data-id="${c.id}" ${pad.personal ? 'disabled' : ''}>${esc(catName(c))}</button>`).join('')}
      <select data-action="kp-cat-more" aria-label="${t('categories')}" ${pad.personal ? 'disabled' : ''}>
        <option value="">${t('moreCats')}</option>${cats.slice(6).map(c => `<option value="${c.id}">${esc(catName(c))}</option>`).join('')}</select>
    </div>
    <input class="kpnote" name="note" placeholder="${t('note')}" autocomplete="off" aria-label="${t('note')}">
    <div class="toggles">
      <button type="button" class="chip ${pad.personal ? 'on' : ''}" data-action="kp-personal" aria-pressed="${pad.personal}">${t('personalToggle')}</button>
      <button type="button" class="chip ${pad.qris ? 'on' : ''}" data-action="kp-qris" aria-pressed="${pad.qris}">${t('qrisToggle')}</button>
      ${pad.saved ? `<span class="hint">${t('saved')}: ${pad.saved}</span>` : ''}
    </div>`}
    ${isIn && pad.saved ? `<p class="hint">${t('saved')}: ${pad.saved}</p>` : ''}
    <div class="keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'].map(k =>
      `<button type="button" data-action="kp-key" data-k="${k}" ${k === 'del' ? `aria-label="${t('delete')}"` : ''}>${k === 'del' ? icon('back') : k}</button>`).join('')}</div>
    <button class="btn ${isIn ? '' : 'amber'} big" ${amount ? '' : 'disabled'}>${t(isIn ? 'saveIn' : 'save')}</button>
  </form>`;
}

// ---------- reports ----------

function renderReport(R) {
  const sales = salesByDay(S), exp = expensesByDay(S);
  const sm = monthSum(sales, R.month), em = monthSum(exp, R.month);
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(R.month, i - 11));
  const rows = months.map(mo => ({ mo, s: monthSum(sales, mo), e: monthSum(exp, mo) }));
  const max = Math.max(1, ...rows.flatMap(r => [r.s, r.e]));
  const W = 360, H = 150, gw = W / 12, bw = (gw - 8) / 2;
  const trend = rows.map((r, i) => {
    const x = i * gw + 3, hs = r.s / max * (H - 4), he = r.e / max * (H - 4);
    return `<g class="grp ${r.mo === R.month ? 'cur' : ''} ${r.s > 0 && !r.e ? 'inc' : ''}" data-action="pick" data-cap="${esc(`${monthTitle(r.mo, true)} · ${t('sales')} ${rp(r.s)} · ${t('expenses')} ${rp(r.e)}${r.s > 0 && !r.e ? ` (${t('noSpend')})` : ` · ${t('profitOf')} ${rp(r.s - r.e)}`}`)}" tabindex="0" role="button">
      <rect class="hit" x="${i * gw}" y="0" width="${gw}" height="${H + 18}"/>
      <rect class="b1" x="${x}" y="${H - hs}" width="${bw}" height="${hs}" rx="2"/>
      <rect class="b2" x="${x + bw + 2}" y="${H - he}" width="${bw}" height="${he}" rx="2"/>
      <text x="${i * gw + gw / 2}" y="${H + 14}">${T().monthsShort[Number(r.mo.slice(5)) - 1]}</text></g>`;
  }).join('');

  const byCat = {};
  for (const m of S.moves) if (m.kind === 'expense' && m.day.startsWith(R.month)) byCat[m.cat] = (byCat[m.cat] || 0) + m.amount;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const cmax = Math.max(1, ...cats.map(c => c[1]));

  const [y, mm] = R.month.split('-').map(Number);
  const nd = new Date(y, mm, 0).getDate();
  const daily = Array.from({ length: nd }, (_, i) => ({ d: i + 1, v: sales[`${R.month}-${String(i + 1).padStart(2, '0')}`] || 0 }));
  const dmax = Math.max(1, ...daily.map(d => d.v)), dw = W / nd;

  const best = {};
  for (const [day, rowsT] of Object.entries(S.tally)) if (day.startsWith(R.month))
    for (const [id, r] of Object.entries(rowsT)) { best[id] ??= { q: 0, v: 0 }; best[id].q += r.qty; best[id].v += r.qty * r.price; }
  const top = Object.entries(best).map(([id, b]) => ({ name: S.menu.find(i => i.id === id)?.name || '?', ...b })).sort((a, b) => b.q - a.q).slice(0, 10);
  const pers = S.moves.filter(m => m.kind === 'personal' && m.day.startsWith(R.month)).reduce((a, m) => a + m.amount, 0);

  return `
  <header class="mhead">
    <a class="iconbtn" href="#/r/${shiftMonth(R.month, -1)}" aria-label="${t('prev')}">${icon('left')}</a>
    <h1>${monthTitle(R.month)}</h1>
    <a class="iconbtn" href="#/r/${shiftMonth(R.month, 1)}" aria-label="${t('next')}">${icon('right')}</a>
  </header>
  ${verdictHTML(t('profitOf'), sm, em, { more: pers ? `<span>${t('personal')} <b>${rp(pers)}</b></span>` : '' })}

  <section class="block">
    <h3>${t('trend')}</h3>
    <p class="legend"><span class="sw b1"></span>${t('sales')} <span class="sw b2"></span>${t('expenses')}</p>
    <svg class="chart" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="${t('trend')}">${trend}</svg>
    <p class="cap" aria-live="polite">${esc(`${monthTitle(R.month, true)} · ${t('sales')} ${rp(sm)} · ${t('expenses')} ${rp(em)} · ${t('profitOf')} ${rp(sm - em)}`)}</p>
  </section>

  <section class="block">
    <h3>${t('byCat')}</h3>
    ${cats.length ? `<ul class="hbars">${cats.map(([id, v]) => `<li><span>${esc(catName(catById(id)))}</span><i style="--w:${(v / cmax * 100).toFixed(1)}%"></i><b>${rp(v)}</b></li>`).join('')}</ul>`
      : `<p class="empty">${t('noExpenses')}</p>`}
  </section>

  <section class="block">
    <h3>${t('perDay')}</h3>
    <svg class="chart" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="${t('perDay')}">${daily.map((d, i) => {
      const h = d.v / dmax * (H - 4);
      return `<g class="grp" data-action="pick" data-cap="${esc(`${d.d} ${T().monthsShort[mm - 1]} · ${rp(d.v)}`)}" tabindex="0" role="button">
        <rect class="hit" x="${i * dw}" y="0" width="${dw}" height="${H + 18}"/>
        <rect class="b1" x="${i * dw + 1}" y="${H - h}" width="${Math.max(1, dw - 2)}" height="${h}" rx="1.5"/>
        ${d.d === 1 || d.d % 5 === 0 ? `<text x="${i * dw + dw / 2}" y="${H + 14}">${d.d}</text>` : ''}</g>`;
    }).join('')}</svg>
    <p class="cap" aria-live="polite">&nbsp;</p>
  </section>

  <section class="block">
    <h3>${t('best')}</h3>
    ${top.length ? `<ol class="best">${top.map(b => `<li><span>${esc(b.name)}</span><i style="--w:${(b.q / top[0].q * 100).toFixed(1)}%"></i><b>${b.q} ${t('qty')}</b><small>${rp(b.v)}</small></li>`).join('')}</ol>`
      : `<p class="empty">${t('noTally')}</p>`}
  </section>`;
}

// ---------- menu ----------

function renderMenu() {
  const groups = [...new Set(S.menu.map(i => i.group).filter(Boolean))];
  const items = [...S.menu].sort((a, b) => (b.active - a.active) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  return `
  <header class="mhead plain"><h1>${t('menuTitle')}</h1></header>
  <p class="hint">${t('menuHelp')}</p>
  <form class="block addrow" data-action="menu-add">
    <input name="name" placeholder="${t('name')}" aria-label="${t('name')}" required>
    <input name="price" data-amount inputmode="numeric" placeholder="${t('price')}" aria-label="${t('price')}" required>
    <input name="group" list="groups" placeholder="${t('groupPh')}" aria-label="${t('group')}">
    <button class="btn">${icon('plus')}${t('add')}</button>
  </form>
  <datalist id="groups">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
  ${items.length ? `<ul class="block editlist">${items.map(i => `
    <li class="${i.active ? '' : 'off'}">
      <form data-action="menu-save" data-id="${i.id}">
        <input name="name" value="${esc(i.name)}" aria-label="${t('name')}">
        <input name="price" data-amount value="${num(i.price)}" inputmode="numeric" aria-label="${t('price')}">
        <input name="group" value="${esc(i.group)}" list="groups" aria-label="${t('group')}">
        <button class="btn small">${t('save')}</button>
        <button type="button" class="btn small ghost" data-action="menu-toggle" data-id="${i.id}">${t(i.active ? 'hide' : 'show')}</button>
      </form></li>`).join('')}</ul>` : `<p class="empty">${t('noMenu')}</p>`}`;
}

// ---------- more ----------

let installEvent = null;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let persisted = null;

function renderMore() {
  const last = S.settings.lastBackup ? new Date(S.settings.lastBackup).toLocaleDateString(S.settings.lang === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : t('never');
  return `
  <header class="mhead plain"><h1>${t('moreTitle')}</h1></header>

  <section class="block">
    <h3>${t('language')}</h3>
    <div class="seg" role="group" aria-label="${t('language')}">
      <button type="button" data-action="lang" data-lang="id" aria-pressed="${S.settings.lang === 'id'}">Bahasa Indonesia</button>
      <button type="button" data-action="lang" data-lang="en" aria-pressed="${S.settings.lang === 'en'}">English</button>
    </div>
  </section>

  <section class="block">
    <h3>${t('backup')}</h3>
    <p class="hint">${t(sync.token ? 'backupHelpSync' : 'backupHelp')}</p>
    <p>${t('lastBackup')}: <b>${last}</b></p>
    <div class="row">
      <button type="button" class="btn" data-action="backup">${icon('share')}${t('backupBtn')}</button>
      <button type="button" class="btn ghost" data-action="restore">${icon('upload')}${t('restoreBtn')}</button>
    </div>
  </section>

  <section class="block">
    <h3>${t('syncTitle')}</h3>
    ${sync.token ? `
      <p class="hint">${t('syncHelpOn')}</p>
      <p>${t('syncLast')}: <b>${sync.last ? new Date(sync.last).toLocaleString(S.settings.lang === 'en' ? 'en-GB' : 'id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : t('never')}</b>${sync.dirty ? ` · ${t('syncPending')}` : ''}</p>
      <div class="row">
        <button type="button" class="btn" data-action="sync">${icon('share')}${t('syncNow')}</button>
        <button type="button" class="btn ghost" data-action="sync-off">${t('syncOff')}</button>
      </div>` : `
      <p class="hint">${t('syncHelp')}</p>
      <form class="row" data-action="sync-on">
        <input name="token" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${t('syncToken')}" aria-label="${t('syncToken')}" required style="flex:1;min-width:180px">
        <button class="btn">${t('syncConnect')}</button>
      </form>`}
  </section>

  <section class="block">
    <h3>${t('install')}</h3>
    ${standalone() ? `<p>${t('installed')}</p>`
      : installEvent ? `<button type="button" class="btn" data-action="install">${icon('download')}${t('installBtn')}</button>`
      : `<p class="hint">${isIOS ? t('installIos') : t('installIos').replace(/^[^:]+:\s*/, '')}</p>`}
    <p class="hint">${t('storage')}: ${persisted ? t('persisted') : t('notPersisted')}</p>
  </section>

  <details class="block">
    <summary><h3>${t('categories')}</h3>${icon('right', 'chev')}</summary>
    <p class="hint">${t('keywordsHelp')}</p>
    <ul class="editlist cats">${S.categories.map(c => `
      <li class="${c.active ? '' : 'off'}"><form data-action="cat-save" data-id="${c.id}">
        <input name="name_id" value="${esc(c.name_id)}" aria-label="${t('nameId')}">
        <input name="name_en" value="${esc(c.name_en)}" aria-label="${t('nameEn')}">
        <input name="keywords" value="${esc(c.keywords)}" aria-label="${t('keywords')}" class="kw">
        <button class="btn small">${t('save')}</button>
        <button type="button" class="btn small ghost" data-action="cat-toggle" data-id="${c.id}">${t(c.active ? 'hide' : 'show')}</button>
      </form></li>`).join('')}</ul>
    <form class="addrow" data-action="cat-add">
      <input name="name_id" placeholder="${t('nameId')}" aria-label="${t('nameId')}" required>
      <input name="name_en" placeholder="${t('nameEn')}" aria-label="${t('nameEn')}">
      <input name="keywords" placeholder="${t('keywords')}" aria-label="${t('keywords')}">
      <button class="btn">${icon('plus')}${t('add')}</button>
    </form>
  </details>
  <p class="hint center">${t('app')} · ${t('offline')}</p>`;
}

// ---------- render ----------

function render() {
  const R = route();
  document.documentElement.lang = S.settings.lang;
  document.title = t('app');
  for (const a of document.querySelectorAll('.tabs a')) {
    const v = a.dataset.view;
    a.setAttribute('aria-current', v === R.view || (v === 'm' && !['r', 'menu', 'more'].includes(R.view)) ? 'page' : 'false');
    a.querySelector('span').textContent = t({ m: 'tabMonth', r: 'tabReport', menu: 'tabMenu', more: 'tabMore' }[v]);
    if (v === 'm' || v === 'r') a.href = `#/${v}/${R.month}`;
  }
  const view = { r: renderReport, menu: renderMenu, more: renderMore }[R.view] || renderMonth;
  $('#view').innerHTML = view(R);

  const dayEl = $('#day');
  const onMonth = !['r', 'menu', 'more'].includes(R.view);
  const showDay = onMonth && (R.day || wide.matches);
  document.body.classList.toggle('sheet-open', Boolean(onMonth && R.day && !wide.matches));
  dayEl.hidden = !showDay;
  if (showDay) dayEl.innerHTML = renderDay(selectedDay(R));
  $('#fab').setAttribute('aria-label', t('addSpend'));
}

function rerender() { save(); render(); }

// ---------- actions ----------

function formData(form) { return Object.fromEntries(new FormData(form)); }

const actions = {
  'close-day'() {
    const R = route();
    if (history.state?.fromMonth) history.back(); else go(`#/m/${R.month}`);
  },
  keypad(el) { openKeypad(el.dataset.day, el.dataset.mode); },
  'total-del'(el) {
    const day = el.dataset.day, old = S.salesTotals[day];
    delete S.salesTotals[day];
    rerender();
    toast(`${t('delete')}: ${rp(old)}`, () => { S.salesTotals[day] = old; rerender(); });
  },
  'move-del'(el) {
    const i = S.moves.findIndex(m => m.id === el.dataset.id);
    const [gone] = S.moves.splice(i, 1);
    rerender();
    toast(`${t('delete')}: ${rp(gone.amount)} ${gone.note}`, () => { S.moves.splice(i, 0, gone); rerender(); });
  },
  backup, restore() { $('#restore-file').click(); },
  sync() { syncNow(true); },
  'sync-off'() { for (const k of Object.keys(sync)) delete sync[k]; saveSync(); render(); },
  async install() { if (installEvent) { installEvent.prompt(); await installEvent.userChoice; installEvent = null; render(); } },
  lang(el) { S.settings.lang = el.dataset.lang; rerender(); },
  'menu-toggle'(el) { const i = S.menu.find(x => x.id === el.dataset.id); i.active = !i.active; rerender(); },
  'cat-toggle'(el) { const c = catById(el.dataset.id); c.active = !c.active; rerender(); },
  undo() { const u = toast.undo; toast.undo = null; $('#toast').classList.remove('on'); u?.(); },
  pick(el) { const cap = el.closest('section').querySelector('.cap'); cap.textContent = el.dataset.cap; el.closest('svg').querySelectorAll('.grp').forEach(g => g.classList.toggle('picked', g === el)); },
  // keypad
  'kp-close'() { $('#keypad').close(); render(); },
  'kp-key'(el) {
    const k = el.dataset.k;
    pad.digits = k === 'del' ? pad.digits.slice(0, -1) : (pad.digits + k).replace(/^0+/, '').slice(0, 10);
    renderKeypadKeepNote();
  },
  'kp-cat'(el) { pad.cat = el.dataset.id; pad.catTouched = true; renderKeypadKeepNote(); },
  'kp-personal'() { pad.personal = !pad.personal; renderKeypadKeepNote(); },
  'kp-mode'(el) { pad.mode = el.dataset.mode; renderKeypad(); },
  'kp-via'(el) { pad.via = el.dataset.via; renderKeypadKeepNote(); },
  'kp-qris'() { pad.qris = !pad.qris; renderKeypadKeepNote(); },
};

function renderKeypadKeepNote() {
  const note = $('#keypad .kpnote')?.value || '';
  renderKeypad();
  $('#keypad .kpnote').value = note;
}

const submits = {
  'sync-on'(form) {
    // a device that already holds data must not be silently replaced by the cloud copy: treat it as changed
    Object.assign(sync, { token: formData(form).token.trim(), version: 0, dirty: S.moves.length > 0 || Object.keys(S.salesTotals).length > 0, last: null });
    saveSync();
    syncNow(true);
  },
  count(form) {
    const f = formData(form), day = form.dataset.day;
    const cash = amountIn(f.cash), qris = amountIn(f.qris), gofood = amountIn(f.gofood);
    if (cash == null && !qris && !gofood) delete S.counts[day];
    else S.counts[day] = { cash, qris: qris || 0, gofood: gofood || 0 };
    rerender();
    toast(t('saved'));
  },
  paste(form) {
    const day = form.dataset.day;
    const { entries, skipped } = parseWA(formData(form).text || '');
    if (isDuplicatePaste(entries, S.moves.filter(m => m.day === day), S.counts[day])) { toast(t('dupPaste')); return; }
    for (const e of entries) {
      if (e.type === 'kas') S.counts[day] = { qris: 0, gofood: 0, ...S.counts[day], cash: e.amount };
      else S.moves.push({ id: uid(), day, amount: e.amount, kind: e.kind, paid: e.paid, note: e.note, cat: e.kind === 'expense' ? guessCategory(e.note, S.categories) : null });
    }
    rerender();
    const big = entries.filter(e => e.type === 'move' && e.amount >= BIG).map(e => rp(e.amount));
    toast(T().savedN(entries.length) + (big.length ? ` · ${t('checkBig')}: ${big.join(', ')}` : '') + (skipped.length ? ` · ${t('skipped')}: ${skipped.slice(0, 3).join(' | ')}` : ''));
  },
  tally(form) {
    const day = form.dataset.day;
    const rows = S.tally[day] || {};
    for (const [id, v] of Object.entries(formData(form))) {
      const qty = money(v) || 0;
      if (qty) rows[id] = { qty, price: rows[id]?.price ?? S.menu.find(i => i.id === id).price };  // price fixed when first recorded
      else delete rows[id];
    }
    if (Object.keys(rows).length) S.tally[day] = rows; else delete S.tally[day];
    rerender();
    toast(t('saved'));
  },
  'menu-add'(form) {
    const f = formData(form);
    if (!f.name.trim() || amountIn(f.price) == null) return;
    S.menu.push({ id: uid(), name: f.name.trim(), price: amountIn(f.price), group: (f.group || '').trim(), active: true });
    rerender();
  },
  'menu-save'(form) {
    const f = formData(form), i = S.menu.find(x => x.id === form.dataset.id);
    if (f.name.trim() && amountIn(f.price) != null) Object.assign(i, { name: f.name.trim(), price: amountIn(f.price), group: (f.group || '').trim() });
    rerender();
    toast(t('saved'));
  },
  'cat-save'(form) {
    const f = formData(form), c = catById(form.dataset.id);
    if (f.name_id.trim()) Object.assign(c, { name_id: f.name_id.trim(), name_en: f.name_en.trim() || f.name_id.trim(), keywords: f.keywords.trim() });
    rerender();
    toast(t('saved'));
  },
  'cat-add'(form) {
    const f = formData(form), nid = f.name_id.trim();
    if (!nid) return;
    S.categories.splice(S.categories.length - 1, 0, { id: uid(), name_id: nid, name_en: f.name_en.trim() || nid, keywords: f.keywords.trim(), active: true });
    rerender();
  },
  'kp-save'(form) {
    const amount = padAmount();
    if (!amount) return;
    const note = (formData(form).note || '').trim();
    const kind = pad.mode === 'in' ? 'sale' : pad.personal ? 'personal' : 'expense';
    const cat = kind === 'expense' ? (pad.catTouched || !note ? pad.cat : guessCategory(note, S.categories)) : null;
    const paid = kind === 'sale' ? pad.via : pad.qris ? 'bank' : 'cash';
    const mv = { id: uid(), day: pad.day, amount, kind, paid, note, cat };
    S.moves.push(mv);
    save();
    pad.saved += 1;
    pad.digits = '';
    renderKeypad();
    toast(`${t('saved')}: ${rp(amount)} ${note}`, () => { S.moves = S.moves.filter(m => m !== mv); pad.saved -= 1; rerender(); });
  },
};

async function backup() {
  const name = `pembukuan-warung-${todayISO()}.json`;
  const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
  const mark = () => { S.settings.lastBackup = new Date().toISOString(); rerender(); };
  for (const type of ['application/json', 'text/plain']) {
    const file = new File([blob], name, { type });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); mark(); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  mark();
}

async function restoreFile(file) {
  try {
    const next = fromBackup(await file.text());
    if (!confirm(t('restoreConfirm'))) return;
    S = next;
    rerender();
    toast(t('restored'));
  } catch {
    toast(t('badFile'));
  }
}

// ---------- wiring ----------

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'FORM' || el.tagName === 'SELECT') return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el); }
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('g[data-action]')) { e.preventDefault(); actions.pick(e.target); }
  if ($('#keypad').open && /^[0-9]$/.test(e.key) && !e.target.matches('input')) { e.preventDefault(); actions['kp-key']({ dataset: { k: e.key } }); }
  if ($('#keypad').open && e.key === 'Backspace' && !e.target.matches('input')) { e.preventDefault(); actions['kp-key']({ dataset: { k: 'del' } }); }
});
document.addEventListener('submit', e => {
  const form = e.target.closest('form[data-action]');
  const fn = form && submits[form.dataset.action];
  if (fn) { e.preventDefault(); fn(form); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.action === 'move-cat') { S.moves.find(m => m.id === el.dataset.id).cat = el.value; rerender(); }
  if (el.dataset.action === 'kp-cat-more' && el.value) { pad.cat = el.value; pad.catTouched = true; renderKeypadKeepNote(); }
  if (el.id === 'restore-file' && el.files[0]) { restoreFile(el.files[0]); el.value = ''; }
});
// rupiah fields format themselves when you leave them
document.addEventListener('focusout', e => {
  const el = e.target;
  if (el.matches('input[data-amount]') && amountIn(el.value) != null) el.value = num(amountIn(el.value));
});
$('#keypad').addEventListener('input', e => {
  if (e.target.matches('.kpnote') && !pad.catTouched && !pad.personal && e.target.value.trim()) {
    const g = guessCategory(e.target.value, S.categories);
    if (g !== pad.cat) { pad.cat = g; renderKeypadKeepNote(); $('#keypad .kpnote').focus(); }
  }
});
$('#keypad').addEventListener('close', () => render());
$('#fab').addEventListener('click', () => openKeypad(route().day));

let lastHash = location.hash;
addEventListener('hashchange', () => {
  // opening a day from its month: remember so "close" can go back instead of stacking history
  const R = route();
  if (R.day && !lastHash.includes('/d/')) history.replaceState({ fromMonth: true }, '');
  lastHash = location.hash;
  render();
  if (R.day && !wide.matches) $('#day').scrollTop = 0;
});
wide.addEventListener('change', render);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; if (route().view === 'more') render(); });

// connect link: https://…/#sync=<code> connects this device once; the code never leaves the device (fragment)
function takeSyncLink() {
  const m = location.hash.match(/^#sync=([\w-]{20,})$/);
  if (!m) return false;
  Object.assign(sync, { token: m[1], version: 0, dirty: S.moves.length > 0 || Object.keys(S.salesTotals).length > 0, last: null });
  saveSync();
  history.replaceState(null, '', location.pathname);
  return true;
}

(async () => {
  try {
    const stored = await load();
    if (stored) S = fromBackup(stored);
  } catch { /* first run or storage blocked: start empty */ }
  try { persisted = await navigator.storage?.persisted?.() || await navigator.storage?.persist?.(); } catch { persisted = false; }
  const linked = takeSyncLink();
  render();
  syncNow(linked);
  addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); else if (sync.dirty) syncNow(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
