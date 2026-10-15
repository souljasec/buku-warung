// Runs before every `wrangler deploy` / `wrangler dev` (see wrangler.jsonc "build"), locally and in Cloudflare Workers Builds:
// 1. self-check (a failure stops the deploy)  2. copy web/ -> dist/  3. stamp the offline-cache VERSION so installed apps update
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

await import('../web/logic.test.mjs');

rmSync('dist', { recursive: true, force: true });
const skip = /(^|\/)(_seed[^/]*|logic\.test\.mjs|\.DS_Store)$/;
cpSync('web', 'dist', { recursive: true, filter: src => !skip.test(src) });

let sha = process.env.WORKERS_CI_COMMIT_SHA || '';
try { sha ||= execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* no git */ }
const version = `${sha.slice(0, 7) || 'local'}-${Date.now().toString(36)}`;
const sw = readFileSync('dist/sw.js', 'utf8').replace(/const VERSION = '[^']*'/, `const VERSION = '${version}'`);
writeFileSync('dist/sw.js', sw);
console.log('built dist/ with cache version', version);
