// What a finished artifact is made of, and what each part costs compressed.
//
//   node scripts/artifact-anatomy.mjs <file.js> [more.js ...]
//
// Two artifacts of the same program can be the same size raw and differ by
// thousands of bytes Brotli. This says where. Each file is cut into the streams
// it is made of -- string literals, number literals, identifier occurrences,
// and the punctuation and keywords holding them together -- and each stream is
// compressed on its own with the same encoder settings as the port.
//
// Reading it: a stream that is the same size raw in two artifacts and different
// compressed is an *arrangement* difference, not a size one. That is the case
// for the identifier stream between katexlil and upstream KaTeX, and it is
// where most of the remaining gap lives (finer 053).
import {parse} from '@babel/parser';
import _traverse from '@babel/traverse';
import fs from 'fs';
import zlib from 'zlib';

const traverse = _traverse.default ?? _traverse;
const brotli = text => zlib.brotliCompressSync(Buffer.from(text), {params: {
  [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
  [zlib.constants.BROTLI_PARAM_LGWIN]: 22,
}}).length;

export function anatomy(code) {
  const ast = parse(code, {sourceType: 'unambiguous', errorRecovery: true});
  const spans = [];
  traverse(ast, {
    Identifier(path) { spans.push([path.node.start, path.node.end, 'identifier']); },
    'StringLiteral|TemplateLiteral'(path) {
      spans.push([path.node.start, path.node.end, 'string']);
      path.skip();
    },
    NumericLiteral(path) { spans.push([path.node.start, path.node.end, 'number']); },
  });
  spans.sort((left, right) => left[0] - right[0]);

  const streams = {string: '', number: '', identifier: '', syntax: ''};
  let skeleton = '';
  let cursor = 0;
  for (const [start, end, kind] of spans) {
    if (start < cursor) continue;            // nested span, already consumed
    const between = code.slice(cursor, start);
    streams.syntax += between;
    skeleton += between;
    streams[kind] += kind === 'identifier' ? `${code.slice(start, end)} ` : code.slice(start, end);
    if (kind === 'identifier') skeleton += 'x';
    cursor = end;
  }
  streams.syntax += code.slice(cursor);
  skeleton += code.slice(cursor);

  return {
    whole: {raw: code.length, brotli: brotli(code)},
    ...Object.fromEntries(Object.entries(streams).map(
      ([name, text]) => [name, {raw: text.length, brotli: brotli(text)}])),
    skeleton: {raw: skeleton.length, brotli: brotli(skeleton)},
  };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/artifact-anatomy.mjs <file.js> [more.js ...]');
  process.exit(2);
}
const ORDER = ['whole', 'string', 'number', 'identifier', 'syntax', 'skeleton'];
const LABEL = {
  whole: 'whole artifact', string: 'string literals', number: 'number literals',
  identifier: 'identifier occurrences', syntax: 'punctuation + keywords',
  skeleton: 'syntax, identifiers as `x`',
};
const tables = files.map(file => [file.split('/').pop(), anatomy(fs.readFileSync(file, 'utf8'))]);
const width = 28;
console.log('stream'.padEnd(width) + tables.map(([name]) =>
  `${name.slice(0, 22)} raw`.padStart(30) + 'brotli'.padStart(9)).join(''));
for (const key of ORDER) {
  console.log(LABEL[key].padEnd(width) + tables.map(([, table]) =>
    String(table[key].raw).padStart(30) + String(table[key].brotli).padStart(9)).join(''));
}
if (tables.length === 2) {
  const [[, a], [, b]] = tables;
  console.log('\ndifference (first minus second)');
  for (const key of ORDER) {
    const raw = a[key].raw - b[key].raw, br = a[key].brotli - b[key].brotli;
    console.log('  ' + LABEL[key].padEnd(width) +
      `raw ${String(raw).padStart(8)}   brotli ${String(br).padStart(7)}`);
  }
}
