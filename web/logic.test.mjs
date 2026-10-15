// Self-check: node web/logic.test.mjs
import assert from 'node:assert/strict';
import { parseWA, newState, salesByDay, expensesByDay, guessCategory, money, fromBackup, monthSum, shiftMonth } from './logic.js';

const { entries, skipped } = parseWA('[09.31, 15/10/2026] Budi: 76 ayam\n15/10/26 09.40 - Budi: 35\n50p\n120q gas\n1.5\n76.000\nkas 1300\nmodal 500\nhalo');
assert.deepEqual(skipped, ['halo']);
assert.deepEqual(entries.map(e => [e.type, e.amount, e.kind, e.paid, e.note]), [
  ['move', 76000, 'expense', 'cash', 'ayam'], ['move', 35000, 'expense', 'cash', ''],
  ['move', 50000, 'personal', 'cash', ''], ['move', 120000, 'expense', 'bank', 'gas'],
  ['move', 1500, 'expense', 'cash', ''], ['move', 76000, 'expense', 'cash', ''],
  ['kas', 1300000, undefined, undefined, undefined], ['move', 500000, 'capital', 'cash', ''],
]);

// the guide's example: 800k -> 1.3M, spending 76+35+214+50p+120q+25, QRIS 180k, GoFood 95k
const s = newState();
const gas = guessCategory('gas', s.categories);
assert.equal(s.categories.find(c => c.id === gas).name_id, 'Gas');
s.counts['2025-01-01'] = { cash: 800000, qris: 0, gofood: 0 };
for (const e of parseWA('76 ayam\n35\n214\n50p\n120q gas\n25').entries)
  s.moves.push({ id: String(s.moves.length), day: '2025-01-02', cat: null, ...e });
s.counts['2025-01-02'] = { cash: 1300000, qris: 180000, gofood: 95000 };
assert.equal(salesByDay(s)['2025-01-02'], 1175000);
assert.equal(expensesByDay(s)['2025-01-02'], 470000);
// own money put in is not a sale
s.moves.push({ id: 'x', day: '2025-01-03', amount: 500000, kind: 'capital', paid: 'cash', cat: null, note: '' });
s.counts['2025-01-03'] = { cash: 1800000, qris: 0, gofood: 0 };
assert.equal(salesByDay(s)['2025-01-03'], 0);
// imported totals add on top
s.salesTotals['2025-01-04'] = 900000;
assert.equal(monthSum(salesByDay(s), '2025-01'), 2075000);

assert.equal(money('1.300.000'), 1300000);
assert.equal(money(''), null);
assert.equal(shiftMonth('2025-01', -1), '2024-12');
assert.equal(shiftMonth('2025-12', 1), '2026-01');
assert.deepEqual(fromBackup(JSON.stringify(s)).moves.length, s.moves.length);
assert.throws(() => fromBackup('{"hello":1}'));
console.log('ok');

// ---------- threat-model cases (THREAT-MODEL.md) ----------
import { amountIn, isDuplicatePaste, syncDecision } from './logic.js';

// S5: hostile backup / cloud copy: ids end up in HTML attributes, so they must be dropped
{
  const evil = '"><img src=x onerror=alert(1)>';
  const book = JSON.parse(JSON.stringify(s));
  book.categories.push({ id: evil, name_id: 'x', name_en: 'x', keywords: '', active: true });
  book.moves.push({ id: evil, day: '2025-01-05', amount: 1000, kind: 'expense', paid: 'cash', cat: null, note: '' });
  book.moves.push({ id: 'ok1', day: '2025-01-05', amount: 2000, kind: 'expense', paid: 'cash', cat: evil, note: 'x'.repeat(5000) });
  book.moves.push({ id: 'neg', day: '2025-01-05', amount: -5, kind: 'expense', paid: 'cash', cat: null, note: '' });
  book.moves.push({ id: 'badday', day: '5 jan', amount: 5, kind: 'expense', paid: 'cash', cat: null, note: '' });
  book.moves.push({ id: 'kind', day: '2025-01-05', amount: 5, kind: '<script>', paid: 'x', cat: null, note: '' });
  book.menu = [{ id: evil, name: 'a', price: 1 }, { id: 'm1', name: '<b>', price: '25000', group: 'g' }];
  book.tally = { '2025-01-05': { [evil]: { qty: 1, price: 1 }, m1: { qty: 2, price: 25000 } }, 'bad': {} };
  book.counts['<x>'] = { cash: 1 };
  book.settings = { lang: '"><svg>', lastBackup: '<x>' };
  const clean = fromBackup(JSON.stringify(book));
  const all = JSON.stringify(clean);
  assert.ok(!all.includes('onerror'), 'no hostile id survives');
  const ok1 = clean.moves.find(m => m.id === 'ok1');
  assert.equal(ok1.cat, null);
  assert.equal(ok1.note.length, 200);
  assert.ok(!clean.moves.some(m => ['neg', 'badday'].includes(m.id)));
  assert.equal(clean.moves.find(m => m.id === 'kind').kind, 'expense');
  assert.equal(clean.moves.find(m => m.id === 'kind').paid, 'cash');
  assert.deepEqual(clean.menu.map(i => [i.id, i.price]), [['m1', 25000]]);
  assert.deepEqual(Object.keys(clean.tally['2025-01-05']), ['m1']);
  assert.ok(!('<x>' in clean.counts) && !('bad' in clean.tally));
  assert.deepEqual(clean.settings, { lang: 'id', lastBackup: null });
  // the money math is unchanged by cleaning a valid book
  assert.equal(salesByDay(fromBackup(JSON.stringify(s)))['2025-01-02'], 1175000);
}

// M1: one thousands rule for every amount field
assert.equal(amountIn('1300'), 1300000);
assert.equal(amountIn('1.300.000'), 1300000);
assert.equal(amountIn('76'), 76000);
assert.equal(amountIn('25000'), 25000);
assert.equal(amountIn('0'), 0);
assert.equal(amountIn(''), null);

// M3: pasting the same WhatsApp text twice
{
  const day = s.moves.filter(m => m.day === '2025-01-02');
  const again = parseWA('76 ayam\n35\n214\n50p\n120q gas\n25').entries;
  assert.equal(isDuplicatePaste(again, day, s.counts['2025-01-02']), true);
  assert.equal(isDuplicatePaste(parseWA('76 ayam\n35\n214\n50p\n120q gas\n25\nkas 1300').entries, day, s.counts['2025-01-02']), true);
  assert.equal(isDuplicatePaste(parseWA('76 ayam\n35\n214\n50p\n120q gas\n25\nkas 1400').entries, day, s.counts['2025-01-02']), false);
  assert.equal(isDuplicatePaste(parseWA('76 ayam\n76 ayam').entries, day, null), false, 'a second real 76 ayam is not a duplicate');
  assert.equal(isDuplicatePaste(parseWA('kas 1300').entries, day, s.counts['2025-01-02']), false, 'a count alone is just a count');
  assert.equal(isDuplicatePaste([], day, null), false);
}

// M7/M8: personal and QRIS spending in the cash math
{
  const b = newState();
  b.counts['2025-02-01'] = { cash: 1000000, qris: 0, gofood: 0 };
  b.moves.push({ id: 'a', day: '2025-02-02', amount: 100000, kind: 'personal', paid: 'cash', cat: null, note: '' });
  b.moves.push({ id: 'b', day: '2025-02-02', amount: 300000, kind: 'expense', paid: 'bank', cat: null, note: '' });
  b.counts['2025-02-03'] = { cash: 1500000, qris: 0, gofood: 0 };  // two days later, no count in between
  assert.equal(salesByDay(b)['2025-02-03'], 600000, 'Δcash 500k + personal cash 100k; QRIS spending not added back');
  assert.equal(expensesByDay(b)['2025-02-02'], 300000, 'personal is not a business expense');
  assert.equal(salesByDay(b)['2025-02-01'] || 0, 0, 'first count is only the baseline');
}

// D1/D2: sync decisions, including a stale edge-cache read
assert.equal(syncDecision({ cloudVersion: 0, cloudHasBook: false, localVersion: 0, dirty: false }), 'push');
assert.equal(syncDecision({ cloudVersion: 5, cloudHasBook: true, localVersion: 0, dirty: false }), 'take', 'new device downloads');
assert.equal(syncDecision({ cloudVersion: 5, cloudHasBook: true, localVersion: 0, dirty: true }), 'ask', 'device with data asks');
assert.equal(syncDecision({ cloudVersion: 4, cloudHasBook: true, localVersion: 5, dirty: false }), 'stale', 'older cloud copy is ignored');
assert.equal(syncDecision({ cloudVersion: 4, cloudHasBook: true, localVersion: 5, dirty: true }), 'stale');
assert.equal(syncDecision({ cloudVersion: 6, cloudHasBook: true, localVersion: 5, dirty: false }), 'take');
assert.equal(syncDecision({ cloudVersion: 6, cloudHasBook: true, localVersion: 5, dirty: true }), 'ask');
assert.equal(syncDecision({ cloudVersion: 5, cloudHasBook: true, localVersion: 5, dirty: true }), 'push');
assert.equal(syncDecision({ cloudVersion: 5, cloudHasBook: true, localVersion: 5, dirty: false }), 'none');
assert.equal(syncDecision({ cloudVersion: 7, cloudHasBook: true, localVersion: -1, dirty: true }), 'ask', 'after a 409');
assert.equal(syncDecision({ cloudVersion: 0, cloudHasBook: false, localVersion: 5, dirty: false }), 'push', 'cloud wiped: restore it');

// M15: a typed sales total replaces the count-derived sales for that day (no double counting)
{
  const b = newState();
  b.counts['2025-03-01'] = { cash: 1000000, qris: 0, gofood: 0 };
  b.counts['2025-03-02'] = { cash: 1600000, qris: 200000, gofood: 0 };
  assert.equal(salesByDay(b)['2025-03-02'], 800000);
  b.salesTotals['2025-03-02'] = 1500000;
  assert.equal(salesByDay(b)['2025-03-02'], 1500000, 'typed total wins, not 2.300.000');
  b.counts['2025-03-03'] = { cash: 1700000, qris: 0, gofood: 0 };
  assert.equal(salesByDay(b)['2025-03-03'], 100000, "the next count still starts from that day's cash");
  delete b.salesTotals['2025-03-02'];
  assert.equal(salesByDay(b)['2025-03-02'], 800000, 'clearing the total returns to the count');
}

// M17: sales recorded as money-in entries (the + button, Masuk), several per day
{
  const b = newState();
  const sale = (id, day, amount, paid = 'cash') => ({ id, day, amount, kind: 'sale', paid, cat: null, note: '' });
  b.moves.push(sale('s1', '2025-04-01', 700000), sale('s2', '2025-04-01', 550000, 'bank'), sale('s3', '2025-04-01', 95000, 'gofood'));
  b.moves.push({ id: 'e1', day: '2025-04-01', amount: 227000, kind: 'expense', paid: 'cash', cat: null, note: '' });
  assert.equal(salesByDay(b)['2025-04-01'], 1345000, 'entries add up');
  assert.equal(expensesByDay(b)['2025-04-01'], 227000, 'a sale is never an expense');
  // a money count on a day with recorded sales does not add to them
  b.counts['2025-03-31'] = { cash: 500000, qris: 0, gofood: 0 };
  b.counts['2025-04-01'] = { cash: 1700000, qris: 0, gofood: 0 };
  assert.equal(salesByDay(b)['2025-04-01'], 1345000, 'recorded sales win over the count');
  // cash sales are inflows: they must not be added back as "cash that went out" in a later count period
  b.moves.push(sale('s4', '2025-04-02', 300000));
  b.counts['2025-04-03'] = { cash: 1800000, qris: 0, gofood: 0 };
  assert.equal(salesByDay(b)['2025-04-03'], 100000, 'Δcash only; the 2 April sale is not counted as spending');
  // parser and validation
  const { entries } = parseWA('jual 1500\nmasuk 200q siang\n76 ayam');
  assert.deepEqual(entries.map(e => [e.kind, e.amount, e.paid]), [['sale', 1500000, 'cash'], ['sale', 200000, 'bank'], ['expense', 76000, 'cash']]);
  const clean = fromBackup(JSON.stringify(b));
  assert.equal(clean.moves.filter(m => m.kind === 'sale').length, 4);
  assert.equal(clean.moves.find(m => m.id === 's3').paid, 'gofood');
  assert.equal(isDuplicatePaste(parseWA('jual 700').entries, [sale('x', '2025-04-01', 700000)], null), true, 'a repeated sale paste is caught too');
}

console.log('threat-model cases ok');
