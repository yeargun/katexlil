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
| **closed world** | `lilscript.closed.toml` · `--target js-module` | the same config with `extern_fields = false`: fields the compiler owns may rename. ESM export names stay so the lane is testable. |

You publish the open-world lane. The closed lane is byte-identical to it today: this port declares
no fields the compiler owns (its objects are `JsValue` bags carried over from the JavaScript), so the
closed contract has nothing to rename. That is the port's defect and the reason it loses to Terser
in both worlds; typing the port is the fix.

The LilScript compiler lives next door at `../lilscript`.

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
to its module, with marginal Brotli per module.

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

Mhchem uses `lilscript.mhchem.toml` with bounded production candidate search.
Level-13 exhaustive search over its large fixed transition graph does not
terminate in a practical build window. The behaviorally exact Lil source stays
normative even if a future compiler or artifact policy changes its compressed
size; the build never falls back to the upstream JavaScript host.

Run `npm run check` for build, TypeScript, official and differential tests,
package, site, and parity checks. `npm run audit` reports the complete source
map, generated-data and asset hashes, declaration/export checks, and raw,
gzip-9, and Brotli-11 sizes for core and contrib artifacts. The library and
closed artifacts are measured directly from compiler output without a
post-compilation minifier.
