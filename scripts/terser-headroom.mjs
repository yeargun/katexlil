// What Terser can still find in a finished LilScript artifact, one option at a time.
//
//   node scripts/terser-headroom.mjs <file.js>
//
// The baseline is Terser's own `{defaults:false}` output, not the input file.
// Terser's printer alone rewrites thousands of bytes and moves Brotli on its
// own; charging that to every option makes each look better than it is and
// inverts the ranking. Measuring against its no-op isolates the transform.
//
// Read the Brotli column against the noise floor from `naming-experiments.mjs`:
// on a 277 KB artifact a single local rename is worth up to 125 bytes, so an
// option that changes almost no raw bytes and "wins" 100 Brotli has compressed
// nothing -- it landed in a different naming basin.
import {minify} from 'terser';
import fs from 'fs';
import zlib from 'zlib';

const brotli = text => zlib.brotliCompressSync(Buffer.from(text), {params: {
  [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
  [zlib.constants.BROTLI_PARAM_LGWIN]: 22,
}}).length;

const OPTIONS = ['arrows', 'booleans', 'collapse_vars', 'comparisons', 'computed_props',
  'conditionals', 'dead_code', 'evaluate', 'hoist_props', 'if_return', 'inline', 'join_vars',
  'loops', 'negate_iife', 'properties', 'reduce_vars', 'sequences', 'side_effects', 'switches',
  'typeofs', 'unused'];

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/terser-headroom.mjs <file.js>');
  process.exit(2);
}
const code = fs.readFileSync(file, 'utf8');
const format = {comments: false};
const noop = await minify(code, {compress: {defaults: false}, mangle: false, format});
const base = {raw: noop.code.length, brotli: brotli(noop.code)};
console.log(`source            raw ${code.length}  brotli ${brotli(code)}`);
console.log(`terser no-op      raw ${base.raw}  brotli ${base.brotli}\n`);

const rows = [];
for (const option of OPTIONS) {
  const out = await minify(code, {compress: {defaults: false, [option]: true}, mangle: false, format});
  rows.push([option, out.code.length - base.raw, brotli(out.code) - base.brotli]);
}
rows.sort((left, right) => left[1] - right[1]);
console.log('option'.padEnd(18) + 'raw Δ'.padStart(9) + 'brotli Δ'.padStart(11));
for (const [option, raw, br] of rows) {
  if (raw || br) console.log(option.padEnd(18) + String(raw).padStart(9) + String(br).padStart(11));
}
const all = await minify(code, {compress: {passes: 3}, mangle: false, format});
console.log(`\nall defaults, passes:3   raw Δ ${all.code.length - base.raw}  brotli Δ ${brotli(all.code) - base.brotli}`);
