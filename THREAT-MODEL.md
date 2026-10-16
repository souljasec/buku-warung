# Threat model: Pembukuan Warung

Scope: the offline web app (`web/`), the sync Worker (`worker/index.js`) with Workers KV, and the people using them.
One deployment serves one warung. Status: **fixed** (with the test that covers it), **accepted** (known, documented),
or **mitigated** (reduced, not removed).

## What we protect
| Asset | Why it matters |
|---|---|
| The book (sales, spending, counts) | Private business data; wrong numbers mean wrong decisions |
| The sync code (`SYNC_TOKEN`) | Whoever has it can read and overwrite the book |
| Availability | The owner must be able to record at the market, offline |
| Correctness | The monthly verdict (untung / rugi) must be honest |

## Trust boundaries
1. **Internet → Worker `/api/book`**: anyone can send requests; only the code authorizes.
2. **File / cloud → app**: backup files and the cloud copy are data that enters the app and gets rendered.
3. **Device storage**: IndexedDB (book) and localStorage (sync code) on the owner's devices.
4. **Human input**: fast, tired, mistyped: the biggest source of wrong numbers.

## Security threats
| # | Scenario | Status | Mitigation / test |
|---|---|---|---|
| S1 | Guessing the sync code | mitigated | 64 hex chars (256 bits); constant-time compare; unauthenticated requests never touch KV. *smoke: no/wrong code → 401* |
| S2 | Bots flooding the API | accepted | Free plan cannot bill; worst case sync pauses for the day (100k requests). Data stays on devices and in KV. |
| S3 | Code leaks (screenshot, shared link, lost phone) | mitigated | Rotate: `wrangler secret put SYNC_TOKEN`, reconnect devices. Code never stored in the book, backups or repo. |
| S4 | Code in the connect link ends up in logs | mitigated | The code sits in the `#fragment`, which browsers never send to servers; the app removes it from the address bar after reading. On iPhone the browser also keeps it in a `pw-sync` cookie for 7 days (`Secure`, `SameSite=Strict`) so "Add to Home Screen" can hand it to the home-screen app, which deletes its copy; the cookie travels only to our own worker over HTTPS, which ignores it. Still in WhatsApp / browser history on the owner's device: treat the link as a password. |
| S5 | **Malicious backup file or cloud copy injects script (XSS)** through record ids rendered into HTML | **fixed** | `fromBackup` validates every field (ids `[A-Za-z0-9_-]`, ISO days, non-negative numbers, enums, string lengths) for every source: IndexedDB, restore, cloud. *test: logic "sanitizes hostile backup", e2e "XSS note renders as text"* |
| S6 | Script injection through notes/names typed by the user | fixed | All text is escaped on render. *e2e: note `<img src=x onerror=…>` shows as text* |
| S7 | Any injected script reading the code from localStorage | mitigated | S5/S6 fixed, plus a strict Content-Security-Policy (`script-src 'self'`, no inline script, `connect-src 'self'`, `frame-ancestors 'none'`). *smoke: CSP header present* |
| S8 | Another website using the API from a visitor's browser | mitigated | No CORS headers, so other origins cannot read responses; every request needs the bearer code (auth never reads cookies, so no CSRF). |
| S9 | Clickjacking the app in an iframe | fixed | `frame-ancestors 'none'`. |
| S10 | Garbage or oversized writes | mitigated | Worker rejects non-JSON and non-book JSON (400) before writing; KV caps a value at 25 MB. *smoke: garbage PUT → 400* |
| S11 | Test/seed files leaking real data from the deployment | fixed | `scripts/build.mjs` copies only app files into `dist/`. *smoke: `_seed.json`, `logic.test.mjs` → 404* |
| S12 | Supply chain | mitigated | No runtime dependencies; no CDN scripts; wrangler pinned in docs/CI. |

## Data integrity and sync
| # | Scenario | Status | Mitigation / test |
|---|---|---|---|
| D1 | Two devices overwrite each other | mitigated | Version check: a write based on an old version gets 409; the app then asks which copy to keep. *smoke + worker test: stale PUT → 409* |
| D2 | **KV edge cache returns an older copy for up to ~60 s** after a write elsewhere, and a device "updates" back to old data | **fixed** | The app ignores a cloud copy whose version is lower than the one it last saw. *logic test "stale cloud read"* |
| D3 | Both devices edited offline, then sync | accepted | Whole-book choice (cloud or this device) via a prompt; per-record merge is future work. KV keeps one dated copy per day for 30 days. |
| D4 | First connect on a device that already has data silently replaced by cloud | fixed | Such a device counts as "changed", so the conflict prompt appears. |
| D5 | **Wrong code entered on first connect stays saved and sync fails silently forever** | **fixed** | On 401 before any successful sync the code is removed and the error shown. |
| D6 | Restoring an old backup overwrites newer data | mitigated | Explicit confirm; with sync on, the cloud's daily snapshots allow recovery. |
| D7 | Browser clears storage (iOS Safari 7-day rule, low disk) | mitigated | Cloud copy; installed home-screen apps are exempt on iOS; persistent-storage request; backup reminder when not syncing. |
| D8 | Unsynced changes lost when the app is closed right away | mitigated | Sync 30 s after changes and on app hide; pending state shown in Lainnya. |

## Money logic and human mistakes
| # | Scenario | Status | Mitigation / test |
|---|---|---|---|
| M1 | **Typing the cash count in thousands (`1300`) in a field that expected full rupiah** → Rp 1.300 instead of Rp 1.300.000 → sales wildly negative | **fixed** | One rule everywhere: numbers under 10.000 mean thousands (keypad, WhatsApp, count, prices). Fields reformat to the full amount when you leave them, so the result is visible. *logic + e2e* |
| M2 | **Typing a full small amount (`5000` for Rp 5.000 parking)** → read as Rp 5.000.000 | **mitigated** | The keypad shows the full amount live and flags anything ≥ Rp 2.000.000; pasted big amounts are listed in the confirmation. *e2e* |
| M3 | **Pasting the same WhatsApp messages twice** doubles the day's spending | **fixed** | A paste whose lines all already exist for that day is skipped with a message. *logic + e2e* |
| M4 | Double-tapping Save in the keypad | fixed | Amount resets after save; Save is disabled at 0. |
| M5 | First cash count treated as a day's sales | fixed | First count is the baseline, explained in the app. *logic* |
| M6 | Days without a count | fixed | Cash sales are computed per count period, any length. *logic* |
| M7 | Own money put in counted as sales; personal money taken counted as a cost | fixed | `modal` subtracts, `p` is not an expense but is added back to cash flow. *logic* |
| M8 | QRIS-paid spending added back to cash | fixed | Only cash-paid moves affect the drawer math. *logic* |
| M9 | Rent/electricity never recorded → profit looks too good | mitigated | Month verdict warns until a rent-category expense exists that month. |
| M10 | Months with sales but no spending recorded look like record profits | mitigated | Drawn hollow / dashed with "pengeluaran belum dicatat". |
| M11 | Category hidden later → its old expenses show the wrong category in the list | **fixed** | A hidden category still appears in that expense's picker. |
| M12 | Price changes rewriting old bestseller values | fixed | Price is fixed when the item is first tallied that day. |
| M13 | Spending recorded after the evening count (same day) | accepted | Counted in that day's spending but not added back to the next cash period; record before counting or count next day. Documented in PANDUAN. |
| M14 | Imported history days have both a total and later counts | fixed | A day's typed or imported total replaces count-derived sales for that day. *logic* |
| M15 | **Recording sales and also doing the money count** counts sales twice | **fixed** | Recorded sales (and imported daily totals) win for that day; the count still sets the starting cash for the next day. *logic + e2e* |
| M17 | **No practical way to record sales** when the drawer never starts the day at a known amount | **fixed** | Sales are entries like expenses: + → Masuk, several per day, cash / QRIS / GoFood, deletable; `jual 1500` in WhatsApp paste. Cash sales are never mistaken for spending in the count math. *logic + e2e* |
| M18 | **The + keypad reopening on Masuk after a sale**, so the next market expense is saved as a sale | **fixed** | + always opens on Keluar; Masuk only from a money-in button or one tap. *e2e: expense after a sale lands in money out* |
| M16 | **A long note widens the day card and pushes the + Tambah button and category pickers off screen** | **fixed** | Cards can no longer grow wider than the screen; long notes end in "…". *e2e: nothing off screen with a long note* |

## Out of scope
Device theft with an unlocked phone (use a screen lock), Cloudflare account compromise (use 2FA on the Cloudflare account),
legal/tax bookkeeping.

## Tests
- `node web/logic.test.mjs`: money math, parser, thousands rule, duplicate paste, backup sanitizing, stale cloud reads.
- `node scripts/smoke.mjs <url> <code>`: **read-only** checks of a deployment (pages, hidden files, security headers, auth,
  conflict and garbage rejection without writing). Safe against the live site.
- `node scripts/e2e.mjs`: drives the real app in headless Chrome against `wrangler dev --local` (keypad, paste, duplicate
  paste, count in thousands, XSS note, reload persistence, connect link, sync between two browsers).
