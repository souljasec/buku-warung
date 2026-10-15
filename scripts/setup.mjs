// One-command setup of your own warung book on Cloudflare (free plan).
//   node scripts/setup.mjs            (asks Cloudflare to log you in if needed)
//   node scripts/setup.mjs --name toko-sari
// Creates the KV store, writes wrangler.jsonc, deploys, sets a random sync code, checks the live site,
// and prints your connect link. Safe to run again: it reuses the store and keeps the code in .sync-code.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const NAME = arg('name', 'buku').toLowerCase();
if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(NAME)) die('--name: use lowercase letters, digits and -');
const WRANGLER = 'npx --yes wrangler@4.151.0';
const say = s => console.log(`\n▸ ${s}`);
function die(msg) { console.error(`\n✘ ${msg}`); process.exit(1); }
const run = (cmd, opts = {}) => {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', ...opts });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}` };
};

// 1. Cloudflare login
say('Checking Cloudflare login');
if (!run(`${WRANGLER} whoami`).out.includes('You are logged in')) {
  console.log('  A browser window opens: log in to the Cloudflare account that should own this app, then click Allow.');
  console.log('  Wrong browser? Run:  npx wrangler login --browser=false  and open the printed link in the right one.');
  if (spawnSync(`${WRANGLER} login`, { shell: true, stdio: 'inherit' }).status !== 0) die('Login failed. Run the setup again.');
}
const who = run(`${WRANGLER} whoami`).out;
console.log('  ' + (who.match(/associated with the email (\S+)/)?.[1] || 'logged in').replace(/\.$/, ''));
if ((who.match(/│ [^│]+│ [0-9a-f]{32} │/g) || []).length > 1 && !process.env.CLOUDFLARE_ACCOUNT_ID) {
  die('This login has several Cloudflare accounts. Set CLOUDFLARE_ACCOUNT_ID=<id> (see `npx wrangler whoami`) and run again.');
}

// 2. KV store for the book (reused when it exists)
say(`Creating the storage "${NAME}-book"`);
let kvId;
const created = run(`${WRANGLER} kv namespace create ${NAME}-book`);
kvId = created.out.match(/"id":\s*"([0-9a-f]{32})"/)?.[1];
if (!kvId) {
  const list = run(`${WRANGLER} kv namespace list`).out;
  try { kvId = JSON.parse(list.slice(list.indexOf('['))).find(n => n.title === `${NAME}-book`)?.id; } catch { /* below */ }
}
if (!kvId) die(`Could not create or find the KV store.\n${created.out}`);
console.log(`  id ${kvId}`);

// 3. config
const cfgPath = 'wrangler.jsonc';
const cfg = readFileSync(cfgPath, 'utf8')
  .replace(/"name":\s*"[^"]*"/, `"name": "${NAME}"`)
  .replace(/"binding":\s*"BOOK",\s*"id":\s*"[^"]*"/, `"binding": "BOOK", "id": "${kvId}"`);
writeFileSync(cfgPath, cfg);

// 4. deploy (the build step runs the self-check first)
say('Deploying');
const dep = run(`${WRANGLER} deploy`);
if (!dep.ok) {
  if (/workers\.dev subdomain/i.test(dep.out)) {
    die('Your Cloudflare account needs a workers.dev name first (one time):\n  dashboard → Workers & Pages → pick a name (e.g. your warung) → then run this setup again.');
  }
  die(`Deploy failed:\n${dep.out.slice(-1500)}`);
}
const url = dep.out.match(/https:\/\/[^\s]+\.workers\.dev/)?.[0];
if (!url) die(`Deployed, but could not read the address:\n${dep.out.slice(-800)}`);
console.log(`  ${url}`);

// 5. sync code (kept in .sync-code so re-runs don't lock your devices out)
say('Setting the secret sync code');
let code = existsSync('.sync-code') ? readFileSync('.sync-code', 'utf8').trim() : '';
if (!/^[\w-]{20,}$/.test(code)) {
  code = randomBytes(32).toString('hex');
  writeFileSync('.sync-code', code + '\n');
  chmodSync('.sync-code', 0o600);
}
const sec = spawnSync(`${WRANGLER} secret put SYNC_TOKEN`, { shell: true, input: code, encoding: 'utf8' });
if (sec.status !== 0) die(`Could not set the secret:\n${sec.stdout}${sec.stderr}`);

// 6. wait for HTTPS (a brand-new workers.dev name can take a few minutes), then check the deployment
say('Waiting for the site to come online');
let up = false;
for (let i = 0; i < 60 && !up; i++) {
  up = await fetch(url).then(r => r.status === 200).catch(() => false);
  if (!up) await new Promise(r => setTimeout(r, 5000));
}
if (!up) console.log('  Not reachable yet (new workers.dev names can take ~10 minutes). Check again later: node scripts/smoke.mjs ' + url);
else {
  const smoke = spawnSync(`node scripts/smoke.mjs ${url} ${code}`, { shell: true, encoding: 'utf8' });
  console.log(smoke.status === 0 ? '  all checks passed' : smoke.stdout.split('\n').filter(l => l.startsWith('FAIL')).join('\n'));
}

console.log(`
✔ Done / Selesai

  App / Aplikasi:   ${url}
  Connect link / Link untuk HP & laptop (keep it private / RAHASIA):
  ${url}/#sync=${code}

  Open the connect link once on every phone and laptop. The code is also saved in .sync-code (never commit it).
  Buka link itu sekali di setiap HP dan laptop. Kodenya juga tersimpan di file .sync-code (jangan di-commit).
`);
if (run('git rev-parse --is-inside-work-tree').ok && !run('git check-ignore -q .sync-code').ok) console.log('  ⚠ add .sync-code to .gitignore');
