// Pure bookkeeping logic: no DOM, no storage. Tested by logic.test.mjs.

export const DEFAULT_CATEGORIES = [
  ['Belanja pasar', 'Market groceries',
    'ayam,daging,beef,steak,ikan,bawang,cabe,tomat,sayur,kol,timun,tepung,telur,telor,beras,bumbu,minyak,tahu,tempe,pisang,keju,masako,merica,micin,kemiri,santan,mie,roti,kentang'],
  ['Minuman', 'Drinks for sale', 'sprite,cola,coca,coke,fanta,aqua,aqoa,teh,kopi,susu,es batu,jos,sirup,jeruk,bir,beer,galon,water,minuman,drink'],
  ['Gas', 'Cooking gas', 'gas,elpiji,lpg'],
  ['Bensin', 'Fuel', 'bensin,pertalite,pertamax,bbm'],
  ['Sewa', 'Rent', 'sewa,kontrak'],
  ['Listrik & air', 'Electricity & water', 'listrik,pln,token,pdam'],
  ['Sampah', 'Trash fee', 'sampah'],
  ['Upacara & canang', 'Ceremony & offerings', 'canang,banten,upacara,odalan,dupa,sesajen'],
  ['Perlengkapan', 'Supplies', 'tisu,tissue,plastik,plastic,sedotan,kresek,sabun,kotak,box,piring,gelas'],
  ['Gaji', 'Wages', 'gaji,upah'],
  ['Komisi GoFood', 'GoFood commission', 'potongan,ptngan,ptngn,komisi,gojek'],
  ['Lain-lain', 'Other', ''],
];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function newState() {
  return {
    v: 1,
    categories: DEFAULT_CATEGORIES.map(([id_, en, kw]) => ({ id: uid(), name_id: id_, name_en: en, keywords: kw, active: true })),
    moves: [],          // {id, day, amount, kind: expense|personal|capital, paid: cash|bank, cat, note}
    counts: {},         // day -> {cash: number|null, qris, gofood}
    menu: [],           // {id, name, price, group, active}
    tally: {},          // day -> {itemId: {qty, price}}
    salesTotals: {},    // day -> amount (imported history)
    settings: { lang: 'id', lastBackup: null },
  };
}

/** WhatsApp shorthand: under 10.000 means thousands (76 -> 76.000, kas 1300 -> 1.300.000). */
export function parseAmount(s) {
  const v = /^\d{1,3}([.,]\d{3})+$/.test(s) ? Number(s.replace(/[.,]/g, '')) : Number(s.replace(',', '.'));
  return Math.round(v < 10000 ? v * 1000 : v);
}

const WA_PREFIX = /^\s*(\[[^\]]*\]\s*[^:]{1,40}:|\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4},?\s+\d{1,2}[.:]\d{2}[^-]*-\s*[^:]{1,40}:)\s*/;
const LINE = /^(kas|modal)?\s*(\d[\d.,]*)\s*([pq]{0,2})(?=\s|$)\s*(.*)$/i;

/** -> {entries, skipped}. entry: {type:'kas', amount} | {type:'move', amount, kind, paid, note} */
export function parseWA(text) {
  const entries = [], skipped = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(WA_PREFIX, '').trim();
    if (!line) continue;
    const m = line.match(LINE);
    if (!m) { skipped.push(raw.trim()); continue; }
    const word = (m[1] || '').toLowerCase(), flags = m[3].toLowerCase(), note = m[4].trim();
    const amount = parseAmount(m[2]);
    if (word === 'kas') entries.push({ type: 'kas', amount });
    else if (word === 'modal') entries.push({ type: 'move', amount, kind: 'capital', paid: 'cash', note });
    else entries.push({ type: 'move', amount, note, kind: flags.includes('p') ? 'personal' : 'expense', paid: flags.includes('q') ? 'bank' : 'cash' });
  }
  return { entries, skipped };
}

/** Form input in full rupiah, any separators: '1.300.000' -> 1300000. Blank -> null. */
export function money(s) {
  const d = String(s ?? '').replace(/\D/g, '');
  return d ? Number(d) : null;
}

export function guessCategory(note, cats) {
  const low = note.toLowerCase();
  const active = cats.filter(c => c.active);
  const hit = active.find(c => c.keywords.split(',').some(k => k.trim() && low.includes(k.trim().toLowerCase())));
  return (hit || active[0] || {}).id ?? null;
}

/** Sales per day. A typed (or imported) sales total for a day is used as is. Otherwise: QRIS + GoFood that day,
 *  plus for each cash count: cash now − cash at previous count + cash that went out in between − own money put in.
 *  The very first cash count is only the starting point. A typed total never adds to a count: one or the other. */
export function salesByDay(state) {
  const out = {};
  const add = (d, v) => { out[d] = (out[d] || 0) + v; };
  for (const [d, c] of Object.entries(state.counts)) add(d, (c.qris || 0) + (c.gofood || 0));
  const cashDays = Object.keys(state.counts).filter(d => state.counts[d].cash != null).sort();
  const cashMoves = state.moves.filter(m => m.paid === 'cash');
  for (let i = 1; i < cashDays.length; i++) {
    const prev = cashDays[i - 1], cur = cashDays[i];
    let moved = 0;
    for (const m of cashMoves) if (m.day > prev && m.day <= cur) moved += m.kind === 'capital' ? -m.amount : m.amount;
    add(cur, state.counts[cur].cash - state.counts[prev].cash + moved);
  }
  for (const [d, v] of Object.entries(state.salesTotals)) out[d] = v;
  return out;
}

export function expensesByDay(state) {
  const out = {};
  for (const m of state.moves) if (m.kind === 'expense') out[m.day] = (out[m.day] || 0) + m.amount;
  return out;
}

export const monthSum = (byDay, month) => Object.entries(byDay).reduce((s, [d, v]) => d.startsWith(month) ? s + v : s, 0);

export const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function rp(v) {
  v = Math.round(v || 0);
  return (v < 0 ? '−' : '') + 'Rp ' + Math.abs(v).toLocaleString('id-ID');
}

/** Short form for tight spaces: 1,2 jt / 450 rb (compact: 1,2jt / 450rb). */
export function rpShort(v, compact = false) {
  const a = Math.abs(v), s = v < 0 ? '−' : '', sp = compact ? '' : ' ';
  if (a >= 1e6) return s + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + sp + 'jt';
  if (a >= 1e3) return s + Math.round(a / 1e3) + sp + 'rb';
  return s + a;
}

// ---------- boundary: anything from a file, the cloud or storage passes through here ----------

const ID = /^[\w-]{1,40}$/, DAY = /^\d{4}-\d{2}-\d{2}$/;
const nonNeg = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(+v) && +v >= 0 ? Math.round(+v) : null;
const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);
const dayEntries = obj => Object.entries(obj && typeof obj === 'object' ? obj : {}).filter(([d]) => DAY.test(d));

/** Validate and clean a backup / cloud copy; returns a full state or throws. Ids end up inside HTML attributes,
 *  so anything not matching ID is dropped: this is the XSS boundary for data we did not type ourselves. */
export function fromBackup(json) {
  const s = typeof json === 'string' ? JSON.parse(json) : json;
  if (!s || s.v !== 1 || !Array.isArray(s.moves) || !Array.isArray(s.categories)) throw new Error('not a Pembukuan Warung backup');
  const base = newState();
  const categories = s.categories.filter(c => c && ID.test(c.id)).map(c => ({
    id: c.id, name_id: str(c.name_id, 60) || str(c.name_en, 60) || '?', name_en: str(c.name_en, 60) || str(c.name_id, 60) || '?',
    keywords: str(c.keywords, 500), active: c.active !== false,
  }));
  const catIds = new Set(categories.map(c => c.id));
  const moves = s.moves.filter(m => m && ID.test(m.id) && DAY.test(m.day) && nonNeg(m.amount) > 0).map(m => ({
    id: m.id, day: m.day, amount: nonNeg(m.amount), kind: oneOf(m.kind, ['expense', 'personal', 'capital'], 'expense'),
    paid: oneOf(m.paid, ['cash', 'bank'], 'cash'), cat: catIds.has(m.cat) ? m.cat : null, note: str(m.note, 200),
  }));
  const counts = Object.fromEntries(dayEntries(s.counts).filter(([, c]) => c && typeof c === 'object')
    .map(([d, c]) => [d, { cash: nonNeg(c.cash), qris: nonNeg(c.qris) || 0, gofood: nonNeg(c.gofood) || 0 }]));
  const menu = (Array.isArray(s.menu) ? s.menu : []).filter(i => i && ID.test(i.id) && nonNeg(i.price) != null).map(i => ({
    id: i.id, name: str(i.name, 80) || '?', price: nonNeg(i.price), group: str(i.group, 40), active: i.active !== false,
  }));
  const tally = Object.fromEntries(dayEntries(s.tally).map(([d, rows]) => [d, Object.fromEntries(
    Object.entries(rows && typeof rows === 'object' ? rows : {}).filter(([id, r]) => ID.test(id) && r && nonNeg(r.qty) > 0)
      .map(([id, r]) => [id, { qty: nonNeg(r.qty), price: nonNeg(r.price) || 0 }]))]).filter(([, rows]) => Object.keys(rows).length));
  const salesTotals = Object.fromEntries(dayEntries(s.salesTotals).filter(([, v]) => nonNeg(v) != null).map(([d, v]) => [d, nonNeg(v)]));
  const st = s.settings && typeof s.settings === 'object' ? s.settings : {};
  return {
    v: 1, categories: categories.length ? categories : base.categories, moves, counts, menu, tally, salesTotals,
    settings: { lang: oneOf(st.lang, ['id', 'en'], 'id'), lastBackup: typeof st.lastBackup === 'string' && !isNaN(Date.parse(st.lastBackup)) ? st.lastBackup : null },
  };
}

/** Amount fields follow the WhatsApp rule: under 10.000 means thousands (76 -> 76.000, 1300 -> 1.300.000). */
export function amountIn(s) {
  const v = money(s);
  return v == null ? null : v > 0 && v < 10000 ? v * 1000 : v;
}

/** True when every spending line of a paste already exists that day (pasting the same WhatsApp text twice). */
export function isDuplicatePaste(entries, dayMoves, dayCount) {
  const moves = entries.filter(e => e.type === 'move');
  if (!moves.length) return false;
  const key = m => `${m.amount}|${m.kind}|${m.paid}|${m.note}`;
  const have = {};
  for (const m of dayMoves) have[key(m)] = (have[key(m)] || 0) + 1;
  for (const e of moves) { if (!have[key(e)]) return false; have[key(e)]--; }
  return entries.filter(e => e.type === 'kas').every(e => dayCount?.cash === e.amount);
}

/** What to do after reading the cloud copy. KV edge caches can serve an older copy for ~60 s after a write elsewhere,
 *  so a cloud version lower than the one this device last saw is ignored rather than taken. */
export function syncDecision({ cloudVersion, cloudHasBook, localVersion, dirty }) {
  if (!cloudHasBook) return 'push';
  if (localVersion > 0 && cloudVersion < localVersion) return 'stale';
  if (cloudVersion !== localVersion) return dirty ? 'ask' : 'take';
  return dirty ? 'push' : 'none';
}
