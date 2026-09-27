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

Built by the LilScript compiler at revision `d1d48c4c` (on `finer/059-idiom-directed-naming`; binary
SHA-256 `47048e41…e194b3041`). That compiler rebuilds the previous release's dist byte for byte, so
every size change here comes from the port's own source: no compiler change. Brotli-11, gzip-9 and
raw bytes from `lilscript-codec`. The previous release is `55c34b5` (dist built by LilScript
`a430d5df`).

What changed in the source:

- `src/entry.lil` exports the public API and nothing else. The official Jest suites import internal
  modules (`parseTree`, `Settings`, `buildMathML`, …); they now come from a separate test entry,
  `test/katex.lil`, compiled into `dist/katex.test.js`. The compiler sees the real export surface of
  the npm file, and the build no longer filters an export list after compiling.
- The contrib files are spelled the way upstream writes them: bare `document`, `window`, `console`,
  `Element`, `Text` and `RegExp` instead of `globalThis` reads; mhchem's logical operators through
  `JS.or`/`JS.and` instead of lambda calls, and its thirteen key loops as `for … in`, as upstream
  loops; render-a11y-string's speech tables as the object literals upstream reads with
  `table[key] || key`, and pushes as method calls; auto-render copies its options with
  `for … in` plus `hasOwnProperty` and calls `preProcess` as a method, as upstream does; copy-tex
  tests `instanceof` through a three-line JavaScript module that the compiler embeds into
  `dist/contrib/copy-tex.mjs` (`lilscript.copy-tex.toml`, `host_modules = "embed"`). Where these
  differ in behaviour from the previous release, they now match upstream (inherited keys in the
  speech tables, `preProcess`'s `this`, options objects that override `hasOwnProperty`).

| File | Written by | Raw | gzip-9 | Brotli-11 | Previous release | vs previous |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `dist/katex.esm.js` / `katex.mjs` (npm ESM) | compiler | 261,015 | 72,094 | **60,056** | 60,281 | **−225** |
| `dist/katex.closed.js` | compiler | 261,015 | 72,094 | 60,056 | 60,281 | −225 |
| `dist/katex.cjs` | post-processed by esbuild, **not compiler-written** (plan M12.2) | 259,911 | 72,655 | 61,061 | 60,962 | +99 |
| `dist/katex.umd.js` / `katex.min.js` | post-processed by esbuild, **not compiler-written** (plan M12.2) | 259,921 | 72,656 | 61,045 | 61,147 | −102 |

The bars, Brotli-11, each an esbuild bundle minified by the tool named (`scripts/lib/official.mjs`;
every lane must import and render a formula before it is measured):

| Bar | Brotli-11 | npm ESM against it |
| --- | ---: | ---: |
| SWC 1.16.2 (2 passes, ECMAScript 2020, top-level mangle) over KaTeX's Flow sources, `__VERSION__` defined | **60,778** | **−722, a win** |
| Terser (3 passes, mangle) over the Flow sources, `__VERSION__` defined | 61,631 | −1,575 |
| SWC over the published `katex@0.16.22` graph | 62,399 | −2,343 |
| Terser over the published graph (the site's headline bar) | 63,044 | −2,988 |
| esbuild minify over the published graph | 63,757 | −3,701 |
| upstream's CDN-only `katex.min.js` | 62,686 | −2,630 |

SWC over the Flow sources is the strongest bar. A win is at least max(100 B, 1% of the bar) below
it: 60,170 B or less against 60,778. The previous release's 60,281 was a tie against it. The bar
moves by a few tens of bytes with SWC's settings and with the two module paths esbuild embeds in
the bundle (a scorecard run from another directory measured 60,740, three passes measure 60,710);
60,056 is a win against each of them. The Flow-source Terser lane used to throw `ReferenceError:
__VERSION__` on import: its recorded 61,758 was not a working program. Against the SWC bar the npm
ESM also wins gzip-9 (72,094 against 73,168) but not raw bytes (261,015 against 259,210): its cost
model is Brotli. Our files carry a 73-byte licence banner that the bars lack. The upstream Git
source built natively and then assembled through esbuild and Terser gives 63,066, and katex's npm
package itself serves `import "katex"` unminified (610,145 raw / 119,059 Brotli-11).

The contrib ESM files are compiler-written. Against Terser of upstream's `dist/contrib/*.mjs`:
auto-render 1,103 against 1,048 (was 1,113), copy-tex 528 against 531 (was 563), mathtex-script-type
228 against 232 (was 282), mhchem 7,862 against 7,413 (was 8,007), render-a11y-string 2,182 against
2,220 (was 2,226). Three are now at or below every minifier's bar (Terser, SWC, Oxc, esbuild), none
by a win's margin; auto-render and mhchem still lose. Their `.cjs` and `.min.js` builds are
post-processed by esbuild, not compiler-written. The site lists every file with its label.

Compile time on the build host (8 vCPU burstable Azure VM, shared with other compiler sessions while
these ran, load average 7.9 to 9.4), wall clock per compiler process over three full builds: the core
ESM took 22.2, 26.7 and 29.2 s, and all nine compiles of a build (the test entry is the new one)
69.1, 80.4 and 82.8 s. `scripts/build.mjs` times every invocation into `.tmp/compile-times/`, and
`node scripts/record-compiler.mjs --revision <rev>` writes them to `site/results.json`. Built from
source on the same host, three alternating runs each, the whole package build
(`node scripts/build.mjs --compile --force`) takes 70.78 s median (60.02–78.98) and KaTeX's own
`yarn build` takes 16.74 s median (15.53–26.96); the records are in `comparison/source-build/`.

## The site and its receipts

Every number on <https://yeargun.github.io/katexlil/> is written by
`node scripts/measure-site.mjs [--spec] [--attribution <json>]`: sizes through
`lilscript-codec` for the shipped ESM, the closed build, and the official lanes
(`scripts/lib/official.mjs`: the published package through esbuild, then Terser,
esbuild-minify and SWC, plus the Flow sources through esbuild, then Terser and SWC;
each lane must import and render a formula first); throughput on
`site/corpus.js` in Node and in headless Chromium through Playwright
(`scripts/lib/browser-bench.mjs`, the same page as `site/bench.html`); and the
official Jest count. `test/browser-perf.test.mjs` is the gate: both lanes must
render the corpus identically and the port may not exceed the regression guard
rail. The smallest official lane in each codec is the strongest bar, and
`site/results.json` `verdict` judges the npm ESM against it. `node scripts/build.mjs --compile --map` (a compiler with
`[javascript.source_map]`) writes `dist/katex.raw.js.map`, and
`node scripts/attribute-map.mjs --json out.json` charges every byte of both lanes
to its module, with marginal Brotli per module. The compiler of this release
(d1d48c4c) does not emit source maps (`lilscript --help` has no map option), so
per-module attribution is not available for it: the site says so, and the table
measured on 2026-09-03 for an earlier compiler and artifact is no longer published.
`measure-site.mjs` stamps a fresh table with the recorded compiler's revision and
carries it only while that compiler is the recorded one.

The root API, CLI, TypeScript declarations, CSS, 60 font files, and all five
official contrib subpaths mirror KaTeX 0.16.22. The font metrics are LilScript
data: `src/data.lil` holds upstream's generated table as an object literal, and the
compiler chooses its encoding against the codec (under Brotli, for this release,
columns of integers scaled by 10^5 with delta-coded keys). `src/fontMetricsData.js`,
upstream's generated module, stays as the reference: `npm run audit` checks it
against `katex@0.16.22` and `scripts/attribute-core.mjs` reads it. What ships is
the table the built artifact decodes, so `test/font-metrics.test.mjs` (part of
`npm test`) reads it back from every built `dist/katex.*` file through the public
`__setFontMetrics` and holds it to `src/fontMetricsData.js`: the same 18 fonts and
2,038 entries, the same key order per font, every number `Object.is`-equal. The unicode
symbol table is built at load by `src/unicodeSymbols.lil`, as upstream does. All five contrib implementations,
including the complete mhchem state machine and render-a11y tree walker, are
normative `.lil` sources; no runtime `.host.mjs` exception remains. The one
JavaScript file among them, `contrib/copy-tex/instanceof.js` (upstream's
`instanceof`, which LilScript cannot spell for host values yet), is embedded by the
compiler at build time and never loaded at run time; `npm run audit` lists it and
fails if a delivered contrib module imports anything but `../katex.mjs`.

Auto-render's delimiter scan uses typed strings/integers, a checked `pure`
scanner, and a closed `DelimiterHit` struct that scalar-replaces in the emitted
module. Render-a11y's speech tables are upstream's object literals, read as upstream reads them.
Mhchem keeps the official dynamic transition/action layout because keys are
parser input and action dispatch data, but its loops and values are explicitly
typed at the LilScript boundary.

Mhchem used to build with its own bounded config, because the old compiler's
level-13 search over its large fixed transition graph did not finish in a
practical build window. The one compiler builds it with `lilscript.toml`: this
release's three recorded builds took 2,410, 2,130 and 2,810 ms (median 2,410 ms;
`site/results.json` `compiler.invocations`). When the bounded config was retired, the
one compiler's mhchem was 1,435 Brotli-11 bytes smaller than it gave, so that config is
gone. The build never falls back to the upstream JavaScript host.

Run `npm run check` for build, TypeScript, official and differential tests,
package, site, and parity checks. `npm run audit` reports the complete
upstream-module to `.lil` map, generated-data and asset hashes, declaration/export checks, and raw,
gzip-9, and Brotli-11 sizes for core and contrib artifacts. The library and
closed artifacts are the compiler's output with no post-compilation minifier;
`src/entry.lil` exports the public API only (the Jest suites' internal modules come
from the test entry, `test/katex.lil`), and the build adds a licence banner and
concatenates nothing onto it. `katex.cjs`, `katex.umd.js`, `katex.min.js` and the contrib `.cjs`
and `.min.js` files are esbuild re-bundles of the compiler's ESM (the compiler
writes ES modules and closed scripts, not CommonJS or IIFE bundles), and they are
labelled as such wherever they are measured.
