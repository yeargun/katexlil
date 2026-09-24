# @itslil/katex



Official [`katex@0.16.22`](https://github.com/KaTeX/KaTeX) algorithms rewritten in LilScript. Official core, screenshot-data, contrib Jest, and differential suites are included. Not affiliated with upstream.

**Site:** [yeargun.github.io/katexlil/](https://yeargun.github.io/katexlil/)

```sh
npm install @itslil/katex
```

Two compiles ship from the same `.lil` source:

| Lane | Config | Meaning |
| --- | --- | --- |
| **open world** (npm) | `lilscript.toml` · `--target js-module` | reusable ESM. Export names, option keys and `extern class` fields stay as written. |
| **closed world** | `lilscript.closed.toml` · `--target js-module` | the lane where fields the compiler owns may rename. ESM export names stay so the lane is testable. |

You publish the open-world lane. The closed lane is byte-identical to it: the one LilScript compiler
renames no property yet, so `extern_fields` has no effect and the closed config is the open one.
The port would give it little to rename anyway, since its objects are mostly `JsValue` bags carried
over from the JavaScript.

The LilScript compiler lives next door at `../lilscript`.

## This release

Built by the one LilScript compiler at revision `aa2052f0` (binary SHA-256 `13cb49a9…77cf18f9`).
Brotli-11 and raw bytes from `lilscript-codec`. The bar is Terser (compress with 3 passes, mangle)
over the published `katex@0.16.22` graph. The previous release is `7f33e78`, whose dist was built on
2026-09-10 by LilScript `4dc4e33`, the old compiler route.

| File | Written by | Raw | Brotli-11 | Previous release | Terser bar | vs bar |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `dist/katex.esm.js` / `katex.mjs` (npm ESM) | compiler | 274,680 | **62,704** | 64,620 | 63,044 | **−340** |
| `dist/katex.closed.js` | compiler | 274,680 | 62,704 | 64,755 | 63,044 | −340 |
| `dist/katex.cjs` | esbuild re-bundle, **not compiler-written** | 272,207 | 63,663 | 65,023 | 63,044 | +619 |
| `dist/katex.umd.js` / `katex.min.js` | esbuild re-bundle, **not compiler-written** | 272,217 | 63,620 | 65,087 | 63,044 | +576 |

The core ESM also wins gzip-9 (75,914 against 76,480) and loses raw (274,680 against 267,050): its
cost model is Brotli. Our files carry a 76-byte licence banner the bar lacks. Other baselines: the
upstream Git source built natively and then assembled through esbuild and Terser gives 63,066; the
Flow sources through esbuild and Terser give 61,758 (the stretch bar); and katex's npm package
itself serves `import "katex"` unminified (610,145 raw / 119,059 Brotli-11; the minified
`katex.min.js`, 62,686, is CDN-only).

The contrib ESM files are compiler-written and lose to Terser of upstream's `dist/contrib/*.mjs`:
auto-render 1,134 against 1,048, copy-tex 572 against 531, mathtex-script-type 282 against 232,
mhchem 8,018 against 7,413, render-a11y-string 2,230 against 2,220. Against the previous release
mhchem is 1,040 smaller and the other four are 13 to 80 bytes larger. Their `.cjs` and `.min.js`
builds are esbuild re-bundles. The site lists every file with its label.

Compile time on the build host (8 vCPU burstable Azure VM), wall clock per compiler process over
three full builds: the core ESM takes about 4.0 s, and all eight compiles of a build about 9.5 s.
`scripts/build.mjs` times every invocation into `.tmp/compile-times/`, and
`node scripts/record-compiler.mjs --revision <rev>` writes them to `site/results.json`.
Built from source on the same host, three alternating runs each, the whole package build
(`node scripts/build.mjs --compile --force`) takes 9.58 s median and KaTeX's own `yarn build` takes
13.00 s median; the records are in `comparison/source-build/`.

## The site and its receipts

Every number on <https://yeargun.github.io/katexlil/> is written by
`node scripts/measure-site.mjs [--spec] [--attribution <json>]`: sizes through
`lilscript-codec` for the shipped ESM, the closed build, and the official lanes
(`scripts/lib/official.mjs`: the published package through esbuild, Terser and
esbuild-minify, plus the Flow sources through esbuild and Terser); throughput on
`site/corpus.js` in Node and in headless Chromium through Playwright
(`scripts/lib/browser-bench.mjs`, the same page as `site/bench.html`); and the
official Jest count. `test/browser-perf.test.mjs` is the gate: both lanes must
render the corpus identically and the port may not exceed the regression guard
rail. `node scripts/build.mjs --compile --map` (a compiler with
`[javascript.source_map]`) writes `dist/katex.raw.js.map`, and
`node scripts/attribute-map.mjs --json out.json` charges every byte of both lanes
to its module, with marginal Brotli per module. The current compiler does not emit
source maps yet, so the site's per-module table is the 2026-09-03 one, marked as not
remeasured.

The root API, CLI, TypeScript declarations, CSS, 60 font files, and all five
official contrib subpaths mirror KaTeX 0.16.22. `src/fontMetricsData.js` remains
generated host data: it contains no runtime algorithm or useful type/layout
information, and embedding its literals in LilScript produces a larger Brotli
artifact. `npm run audit` checks its values against `katex@0.16.22`. The unicode
symbol table is built at load by `src/unicodeSymbols.lil`, as upstream does. All five contrib implementations,
including the complete mhchem state machine and render-a11y tree walker, are
normative `.lil` sources; no runtime `.host.mjs` exception remains.

Auto-render's delimiter scan uses typed strings/integers, a checked `pure`
scanner, and a closed `DelimiterHit` struct that scalar-replaces in the emitted
module. Render-a11y's fixed speech tables are pure typed lookup functions.
Mhchem keeps the official dynamic transition/action layout because keys are
parser input and action dispatch data, but its loops and values are explicitly
typed at the LilScript boundary.

Mhchem used to build with its own bounded config, because the old compiler's
level-13 search over its large fixed transition graph did not finish in a
practical build window. The one compiler builds it with `lilscript.toml` in about
1.4 s, 1,435 Brotli-11 bytes smaller than the bounded config gave, so that config
is gone. The build never falls back to the upstream JavaScript host.

Run `npm run check` for build, TypeScript, official and differential tests,
package, site, and parity checks. `npm run audit` reports the complete source
map, generated-data and asset hashes, declaration/export checks, and raw,
gzip-9, and Brotli-11 sizes for core and contrib artifacts. The library and
closed artifacts are the compiler's output with no post-compilation minifier; the
build only concatenates the upstream font-metrics data module and the `version`
export onto it. `katex.cjs`, `katex.umd.js`, `katex.min.js` and the contrib `.cjs`
and `.min.js` files are esbuild re-bundles of the compiler's ESM (the compiler
writes ES modules and closed scripts, not CommonJS or IIFE bundles), and they are
labelled as such wherever they are measured.
