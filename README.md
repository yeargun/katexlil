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

Built by the LilScript compiler at revision `a430d5df` (batch D on `finer/059-idiom-directed-naming`,
which makes data tables a codec-judged choice; binary SHA-256 `6d307b5f…b1fa2d4f`). Brotli-11 and raw
bytes from `lilscript-codec`. The bar is Terser (compress with 3 passes, mangle) over the published
`katex@0.16.22` graph. The previous release is `d9e8464`, whose dist was built on 2026-09-24 by
LilScript `aa2052f0`.

What changed: the font-metrics table is LilScript data now (`src/data.lil`), and `version` is a
LilScript export. The compiler writes the whole module and picks the table's encoding against the
codec; the build no longer concatenates upstream's data module and a `version` export onto it.

| File | Written by | Raw | Brotli-11 | Previous release | Terser bar | vs bar |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `dist/katex.esm.js` / `katex.mjs` (npm ESM) | compiler | 261,313 | **60,281** | 62,704 | 63,044 | **−2,763** |
| `dist/katex.closed.js` | compiler | 261,313 | 60,281 | 62,704 | 63,044 | −2,763 |
| `dist/katex.cjs` | post-processed by esbuild, **not compiler-written** (plan M12.2) | 260,037 | 60,962 | 63,663 | 63,044 | −2,082 |
| `dist/katex.umd.js` / `katex.min.js` | post-processed by esbuild, **not compiler-written** (plan M12.2) | 260,047 | 61,147 | 63,620 | 63,044 | −1,897 |

The core ESM also wins gzip-9 (72,187 against 76,480) and raw (261,313 against 267,050), though its
cost model is Brotli. Our files carry a 73-byte licence banner the bar lacks. Other baselines: the
upstream Git source built natively and then assembled through esbuild and Terser gives 63,066; the
Flow sources through esbuild and Terser give 61,758 (the stretch bar, 1,477 above the core ESM); and
katex's npm package itself serves `import "katex"` unminified (610,145 raw / 119,059 Brotli-11; the
minified `katex.min.js`, 62,686, is CDN-only).

The contrib ESM files are compiler-written and still lose to Terser of upstream's `dist/contrib/*.mjs`:
auto-render 1,113 against 1,048, copy-tex 563 against 531, mathtex-script-type 282 against 232,
mhchem 8,007 against 7,413, render-a11y-string 2,226 against 2,220. Against the previous release four
are 4 to 21 bytes smaller and mathtex-script-type is byte-identical. Their `.cjs` and `.min.js`
builds are post-processed by esbuild, not compiler-written. The site lists every file with its label.

Compile time on the build host (8 vCPU burstable Azure VM, shared with other compiler sessions while
these ran), wall clock per compiler process over three full builds: the core ESM took 29.2, 34.7 and
20.2 s, and all eight compiles of a build 71.7, 71.8 and 41.6 s. The previous release's compiler
took about 4.0 s for the core ESM. `scripts/build.mjs` times every invocation into
`.tmp/compile-times/`, and `node scripts/record-compiler.mjs --revision <rev>` writes them to
`site/results.json`. Built from source on the same host, three alternating runs each, the whole
package build (`node scripts/build.mjs --compile --force`) takes 54.89 s median (42.11–57.03) and
KaTeX's own `yarn build` takes 14.36 s median (13.50–28.82); the records are in
`comparison/source-build/`.

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
official contrib subpaths mirror KaTeX 0.16.22. The font metrics are LilScript
data: `src/data.lil` holds upstream's generated table as an object literal, and the
compiler chooses its encoding against the codec (under Brotli, for this release,
columns of integers scaled by 10^5 with delta-coded keys). `src/fontMetricsData.js`,
upstream's generated module, stays as the reference: `npm run audit` checks it
against `katex@0.16.22` and `scripts/attribute-core.mjs` reads it. The audit does
not parse `src/data.lil`; for this release its 18 fonts and 2,038 entries were
compared with `src/fontMetricsData.js` and are identical. The unicode
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
build adds a licence banner and drops internal names from the export list, and
concatenates nothing onto it. `katex.cjs`, `katex.umd.js`, `katex.min.js` and the contrib `.cjs`
and `.min.js` files are esbuild re-bundles of the compiler's ESM (the compiler
writes ES modules and closed scripts, not CommonJS or IIFE bundles), and they are
labelled as such wherever they are measured.
