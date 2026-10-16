# Buku Warung · Pembukuan Warung

**[English](#english)** · **[Bahasa Indonesia](#bahasa-indonesia)**

Offline bookkeeping for street warungs and small food stalls: **is my warung making money or losing money?**
Pembukuan sederhana untuk warung: **untung atau rugi bulan ini?**

- Works on Android, iPhone and laptops, also without internet · Jalan di Android, iPhone dan laptop, juga tanpa internet
- Your own copy on Cloudflare's free plan, set up with one command · Salinan sendiri di Cloudflare gratis, dipasang dengan satu perintah
- No accounts, no ads, no tracking · Tanpa akun, tanpa iklan, tanpa pelacakan

---

## English

### What it does
- **Month calendar:** the month's profit as one big ▲ profit / ▼ loss; every day stamped with its own result; a 12-month strip.
- **Money out in seconds:** the orange **+** opens a keypad: `76` = Rp 76.000, pick a category, save. Large amounts are flagged.
- **Money in, same button:** the **+** keypad has **Out | In**. Record sales as often as you like (one evening total or several
  entries, cash / QRIS / GoFood). Optional: the evening **money count** works sales out from the drawer instead.
- **Paste from WhatsApp:** message yourself while shopping (`jual 1500` money in, `76 ayam`, `50p` personal, `120q` paid by QRIS, `kas 1300`,
  `modal 500`), paste in the evening. Pasting the same messages twice is detected.
- **Reports:** 12-month trend, spending by category, sales per day, bestsellers (optional item tally).
- **Same data on every device:** each phone/laptop keeps a working copy; your Cloudflare copy keeps them in sync.
- Indonesian / English, light / dark, installable, works offline.

One number rule everywhere: **under 10.000 means thousands**, so `76` = Rp 76.000 and `1300` = Rp 1.300.000.

### Set up your own (about 5 minutes, free)
You need: a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and [Node.js 20+](https://nodejs.org) on a computer.

```
git clone https://github.com/souljasec/buku-warung.git
cd buku-warung
node scripts/setup.mjs --name buku
```

The setup script:
1. logs you in to Cloudflare (a browser window opens; click **Allow**),
2. creates the storage for your book,
3. deploys the app,
4. creates a random secret sync code,
5. checks the live site,
6. prints your **connect link**: `https://buku.<your-name>.workers.dev/#sync=<code>`.

Open the connect link once on each phone and laptop. That's it.

- **First time on Cloudflare?** The script asks you to pick a free `workers.dev` name once
  (dashboard → Workers & Pages), then run it again. A brand-new name can take ~10 minutes before the site answers.
- **Keep the connect link private.** It works like a password. The code is also saved in `.sync-code` (git-ignored).
- **Several Cloudflare accounts?** Run `CLOUDFLARE_ACCOUNT_ID=<id> node scripts/setup.mjs` (ids: `npx wrangler whoami`).
- Running the script again is safe: it reuses your storage and your code.

### Using it
See the short guide **[PANDUAN.md](PANDUAN.md)** (Indonesian). Daily rhythm:
1. **Paying for something:** orange **+** → amount → category → Save.
2. **Sales:** orange **+** → **In** → amount → cash / QRIS / GoFood → Save (once at night or several times a day).
3. **Month end:** add rent (yearly rent ÷ 12), electricity, trash, ceremonies; read the month's profit.

Installing to the home screen is optional, but then it opens full screen like a real app:

- **Android (Chrome):** menu ⋮ → *Install app* (or *Add to Home screen*).
- **iPhone, Safari:** open the connect link, then tap Share (□↑) → *Add to Home Screen* → *Add*.
- **iPhone, Chrome:** open the connect link, then tap Share (□↑, in the address bar) → *Add to Home Screen* → *Add*.
- If iOS shows an **Open as Web App** switch, leave it on. Always open the app from the new icon.

Home-screen apps on iPhone get their own empty storage. The only thing iOS (17.2 or newer) copies into a new home-screen
app is the site's cookies, so on iPhone the connect link also leaves the code in a cookie for 7 days: add the icon within
that week and the app connects to the cloud copy by itself on first launch (it then deletes its copy of the cookie).
Older iOS, or the icon was added before opening the link? Paste the code once in **More → Cloud sync**, or delete the
icon and redo the steps above. Changed the code? Open the new link, then delete the icon and add it again.

### Where your data lives
- On each device (IndexedDB), as one JSON book, so the app works offline.
- In **your** Cloudflare account (Workers KV), protected by your sync code. Changes are sent ~30 s after you stop typing
  and fetched when the app opens; if two devices both changed, the app asks which to keep. One dated copy per day is kept
  for 30 days. One warung uses a handful of KV writes a day (free plan: 1.000/day, 1 GB).
- Without the code, anyone opening your site gets an empty app; nothing they do reaches your book.
- Extra safety: **More → Save a backup** shares a `.json` file (Google Drive, WhatsApp); **Restore from file** brings it back.

### Updates and automatic deploys
- Get updates: `git pull`, then `npx wrangler deploy`. Deploys replace code only: your book and code are untouched.
- Deploy on every push: put this repo on your GitHub (commit `wrangler.jsonc`: the KV id is not a secret),
  then Cloudflare dashboard → your Worker → Settings → Builds → connect the repo. Every build runs the self-check first.
- Lost phone or leaked link: `npx wrangler secret put SYNC_TOKEN` with a new code, update `.sync-code`, reconnect devices.

### Security and tests
See **[THREAT-MODEL.md](THREAT-MODEL.md)**: security, sync and money-logic scenarios, each with its mitigation and test.
- `node web/logic.test.mjs`: money math, parser, thousands rule, duplicate paste, hostile backups, sync decisions (runs on every deploy)
- `node scripts/smoke.mjs <url> <code>`: read-only checks of a deployment (pages, hidden files, security headers, auth)
- `node scripts/e2e.mjs`: the real app in headless Chrome against a local worker (`npm run dev`): keypad, paste, offline,
  two devices, script injection, wrong code, CSP

### Project layout
```
web/          the app: index.html, app.js (screens, storage, sync), logic.js (money math), i18n.js, style.css, sw.js
worker/       sync API: GET / PUT /api/book (one JSON in KV, bearer code, version check)
scripts/      setup.mjs, build.mjs (runs before every deploy), smoke.mjs, e2e.mjs
```
Plain HTML/CSS/JS, no framework, no runtime dependencies. Local: `npm run dev` (put a 20+ character
`SYNC_TOKEN=...` in `.dev.vars` to try sync) → http://127.0.0.1:8787.

License: [MIT](LICENSE).

---

## Bahasa Indonesia

### Fungsinya
- **Kalender bulanan:** laba bulan ini dalam satu angka besar, ▲ untung / ▼ rugi; setiap hari punya tanda sendiri.
- **Catat uang keluar dalam hitungan detik:** tombol oranye **+** → ketik angka (`76` = Rp 76.000) → pilih kategori → Simpan.
  Jumlah yang sangat besar diberi tanda supaya dicek.
- **Uang masuk, tombol yang sama:** tombol **+** punya **Keluar | Masuk**. Catat penjualan sekali (total malam) atau beberapa
  kali (tunai / QRIS / GoFood). Opsional: **hitung uang** malam hari, aplikasi menghitung penjualan dari laci.
- **Tempel dari WhatsApp:** kirim pesan ke diri sendiri saat belanja (`jual 1500` uang masuk, `76 ayam`, `50p` pribadi, `120q` bayar QRIS,
  `kas 1300`, `modal 500`), tempel malam hari. Kalau tertempel dua kali, aplikasi mengenalinya.
- **Laporan:** 12 bulan terakhir, pengeluaran per kategori, penjualan per hari, menu terlaris.
- **Data sama di semua HP dan laptop**, Bahasa Indonesia / English, bisa dipakai tanpa internet.

Aturan angka di semua tempat: **di bawah 10.000 dibaca ribuan**: `76` = Rp 76.000, `1300` = Rp 1.300.000.

### Pasang sendiri (±5 menit, gratis)
Yang dibutuhkan: akun [Cloudflare](https://dash.cloudflare.com/sign-up) gratis dan [Node.js 20+](https://nodejs.org) di komputer.

```
git clone https://github.com/souljasec/buku-warung.git
cd buku-warung
node scripts/setup.mjs --name buku
```

Skrip ini:
1. login ke Cloudflare (browser terbuka, klik **Allow**),
2. membuat penyimpanan untuk buku warung,
3. memasang aplikasi,
4. membuat kode sinkron rahasia,
5. mengecek situsnya,
6. menampilkan **link untuk HP & laptop**: `https://buku.<nama-anda>.workers.dev/#sync=<kode>`.

Buka link itu sekali di setiap HP dan laptop. Selesai.

- **Pertama kali pakai Cloudflare?** Skrip akan meminta Anda memilih nama `workers.dev` gratis sekali saja
  (dashboard → Workers & Pages), lalu jalankan lagi. Nama baru bisa butuh ±10 menit sebelum situsnya aktif.
- **Link itu RAHASIA**, fungsinya seperti kata sandi. Kodenya juga tersimpan di file `.sync-code`.
- Menjalankan skrip lagi aman: penyimpanan dan kode yang sama dipakai lagi.

### Cara pakai
Baca panduan singkat **[PANDUAN.md](PANDUAN.md)**. Setiap hari:
1. **Bayar sesuatu:** tombol oranye **+** → angka → kategori → Simpan.
2. **Penjualan:** tombol oranye **+** → **Masuk** → angka → tunai / QRIS / GoFood → Simpan (sekali malam hari atau beberapa kali).
3. **Akhir bulan:** catat sewa (sewa setahun ÷ 12), listrik, sampah, upacara; lihat laba bulan ini.

Pasang ke layar utama itu opsional, tapi setelah itu terbuka layar penuh seperti aplikasi biasa:

- **Android (Chrome):** menu ⋮ → *Instal aplikasi* (atau *Tambahkan ke Layar utama*).
- **iPhone, Safari:** buka link sinkron, lalu ketuk Bagikan (□↑) → *Tambah ke Layar Utama* → *Tambah*.
- **iPhone, Chrome:** buka link sinkron, lalu ketuk Bagikan (□↑, di kolom alamat) → *Tambah ke Layar Utama* → *Tambah*.
- Kalau iOS menampilkan tombol **Buka sebagai Aplikasi Web**, biarkan menyala. Selalu buka aplikasi dari ikon baru itu.

Aplikasi di layar utama iPhone punya penyimpanan sendiri yang masih kosong. Satu-satunya yang disalin iOS (17.2 ke atas) ke
aplikasi baru di layar utama adalah cookie situs, jadi di iPhone link sinkron juga menyimpan kodenya di cookie selama 7 hari:
tambahkan ikon dalam minggu itu dan saat pertama dibuka aplikasi langsung tersambung ke cloud (lalu menghapus salinan
cookie-nya). iOS lebih lama, atau ikon dibuat sebelum membuka link? Tempel kodenya sekali di **Lainnya → Sinkron ke cloud**,
atau hapus ikon lalu ulangi langkah di atas. Kode diganti? Buka link baru, lalu hapus ikon dan tambahkan lagi.

### Data disimpan di mana
- Di setiap HP/laptop, supaya bisa dipakai tanpa internet.
- Di akun Cloudflare **Anda sendiri**, dijaga oleh kode sinkron. Perubahan dikirim ±30 detik setelah selesai mengetik dan
  diambil saat aplikasi dibuka. Ada salinan harian yang disimpan 30 hari.
- Tanpa kode, orang lain yang membuka situs Anda hanya melihat aplikasi kosong; tidak bisa melihat atau mengubah data Anda.
- Cadangan tambahan: **Lainnya → Simpan cadangan** (ke Google Drive / WhatsApp), **Pulihkan dari file** untuk mengembalikan.

### Pembaruan
- `git pull`, lalu `npx wrangler deploy`. Pembaruan hanya mengganti kode; data dan kode sinkron tidak berubah.
- HP hilang atau link tersebar: `npx wrangler secret put SYNC_TOKEN` dengan kode baru, perbarui `.sync-code`, hubungkan lagi setiap perangkat.

Lisensi: [MIT](LICENSE).
