// Fails the build when a size budget from spec 3.5 is exceeded. Run after `vite build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGETS = {
  jsGzipKB: 350, // all JavaScript, gzipped (three.js included)
  firstLoadMB: 8, // everything a first visit downloads (Phase 1: the whole dist)
};

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let files = [];
try {
  files = walk('dist');
} catch {
  console.error('No dist folder: run npm run build first.');
  process.exit(1);
}
// the Draco decoder's plain-JS fallback is only fetched by a browser without WebAssembly, so it is
// not part of what a visit downloads (the WebAssembly decoder and its small wrapper are counted)
const js = files.filter((f) => f.endsWith('.js') && !f.endsWith('sw.js') && !/draco_decoder-[^/\\]*\.js$/.test(f));
if (js.length === 0) {
  console.error('The build has no JavaScript: it did not finish.');
  process.exit(1);
}
const jsGzip = js.reduce((n, f) => n + gzipSync(readFileSync(f)).length, 0) / 1024;
const total = files.reduce((n, f) => n + statSync(f).size, 0) / 1024 / 1024;

const rows = [
  ['JS (gzip)', `${jsGzip.toFixed(1)} KB`, `${BUDGETS.jsGzipKB} KB`, jsGzip <= BUDGETS.jsGzipKB],
  ['First load', `${total.toFixed(2)} MB`, `${BUDGETS.firstLoadMB} MB`, total <= BUDGETS.firstLoadMB],
];
for (const [name, value, limit, ok] of rows) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(12)} ${value.padStart(10)}  (budget ${limit})`);
if (rows.some((r) => !r[3])) {
  console.error('A size budget was exceeded.');
  process.exit(1);
}
