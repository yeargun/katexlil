// How much of a finished artifact's compressed size is decided by *which* name
// went where, rather than by how many bytes the names take.
//
//   node scripts/naming-experiments.mjs <file.js>
//
// Three probes, all size-neutral or nearly so:
//
//   swap        two same-length locals inside one function trade names. The
//               program and every byte count are identical; only the arrangement
//               moves. This is the noise floor for every other Brotli
//               measurement on an artifact this size.
//   canonical   every function's bindings are renamed, in order of first
//               appearance, to one fixed sequence, so functions that are shaped
//               alike come out spelled alike.
//   terser      Terser's own mangler over the same code with `compress:false`,
//               which is that algorithm's score against ours on our own output.
import {parse} from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import {minify} from 'terser';
import fs from 'fs';
import zlib from 'zlib';

const traverse = _traverse.default ?? _traverse;
const generate = _generate.default ?? _generate;
const brotli = text => zlib.brotliCompressSync(Buffer.from(text), {params: {
  [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
  [zlib.constants.BROTLI_PARAM_LGWIN]: 22,
}}).length;

// Ordered by how often each letter already carries a mangled local, so the
// canonical spelling stays close to the frequency the mangler chose.
const SEQUENCE = 'etrnoasilcdufpmhgybvkwxjqz'.split('');

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/naming-experiments.mjs <file.js>');
  process.exit(2);
}
const code = fs.readFileSync(file, 'utf8');
const reprint = edit => {
  const ast = parse(code, {sourceType: 'unambiguous', errorRecovery: true});
  if (edit) edit(ast);
  return generate(ast, {compact: true, jsescOption: {minimal: true}}).code;
};

// Babel's printer differs from the compiler's, so every number below is against
// a babel-reprinted baseline rather than the file itself.
const base = reprint(null);
const baseBrotli = brotli(base);
console.log(`file                     raw ${code.length}  brotli ${brotli(code)}`);
console.log(`babel-reprinted baseline raw ${base.length}  brotli ${baseBrotli}\n`);

const scan = parse(code, {sourceType: 'unambiguous', errorRecovery: true});
const pairs = [];
traverse(scan, {Function(path) {
  const bindings = Object.entries(path.scope.bindings)
    .filter(([name]) => name.length === 1)
    .sort((left, right) => right[1].references - left[1].references);
  if (bindings.length >= 2) {
    pairs.push({start: path.node.start, a: bindings[0][0], b: bindings[1][0],
      references: bindings[0][1].references + bindings[1][1].references});
  }
}});
pairs.sort((left, right) => right.references - left.references);

console.log('swap two locals inside one function (identical program, identical size):');
for (const pair of pairs.slice(0, 6)) {
  const out = reprint(ast => traverse(ast, {Function(path) {
    if (path.node.start !== pair.start) return;
    path.scope.rename(pair.a, 'Ʉswap');
    path.scope.rename(pair.b, pair.a);
    path.scope.rename('Ʉswap', pair.b);
  }}));
  console.log(`  ${pair.a} <-> ${pair.b}`.padEnd(14) +
    `(${String(pair.references).padStart(4)} refs)  raw Δ ${String(out.length - base.length).padStart(3)}` +
    `   brotli Δ ${String(brotli(out) - baseBrotli).padStart(6)}`);
}

let canonicalised = 0;
let skipped = 0;
const canonical = reprint(ast => {
  const scopes = [];
  traverse(ast, {Function(path) { scopes.push(path); }});
  for (const path of scopes) {
    const bindings = Object.entries(path.scope.bindings)
      .filter(([, binding]) => binding.identifier && binding.identifier.start != null)
      .sort((left, right) => left[1].identifier.start - right[1].identifier.start);
    const names = bindings.map(([name]) => name);
    if (names.length < 2 || names.length > SEQUENCE.length || names.some(n => n.length > 2)) {
      skipped++;
      continue;
    }
    const targets = SEQUENCE.slice(0, names.length);
    // A target naming something this scope can see but does not own would capture it.
    if (targets.some(t => !names.includes(t) && (path.scope.hasBinding(t) || path.scope.hasGlobal(t)))) {
      skipped++;
      continue;
    }
    const holding = names.map((_, index) => `Ʉhold${index}`);
    names.forEach((name, index) => path.scope.rename(name, holding[index]));
    holding.forEach((name, index) => path.scope.rename(name, targets[index]));
    canonicalised++;
  }
});
console.log(`\ncanonical names by first appearance (${canonicalised} scopes, ${skipped} skipped):`);
console.log(`  raw Δ ${canonical.length - base.length}   brotli Δ ${brotli(canonical) - baseBrotli}`);

const printed = await minify(code, {compress: false, mangle: false, format: {comments: false}});
const mangled = await minify(code, {compress: false, mangle: {toplevel: true}, format: {comments: false}});
console.log(`\nterser printer only      raw ${printed.code.length}  brotli ${brotli(printed.code)}`);
console.log(`terser mangler as well   raw ${mangled.code.length}  brotli ${brotli(mangled.code)}` +
  `   (its mangler against ours: ${brotli(mangled.code) - brotli(printed.code)})`);
