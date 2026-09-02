# @itslil/katex

Official [`katex@0.16.22`](https://github.com/KaTeX/KaTeX) algorithms rewritten in LilScript. Official core, screenshot-data, contrib Jest, and differential suites are included. Not affiliated with upstream.

**Site:** [yeargun.github.io/katexlil/](https://yeargun.github.io/katexlil/)

```sh
npm install @itslil/katex
```

Two compiles ship from the same `.lil` source:

| Lane | Config | Meaning |
| --- | --- | --- |
| **library** (npm) | `lilscript.toml` · `--target js-module` | reusable ESM. Export names and `extern class` keys stay. |
| **closed** | `lilscript.closed.toml` · `--target js-module` | closed LilScript world. `extern class` keys may mangle. ESM export names stay so the lane is testable. |

You publish the full-graph library lane. `dist/katex.closed.js` is diagnostic only.

The LilScript compiler lives next door at `../lilscript`.

The root API, CLI, TypeScript declarations, CSS, 60 font files, and all five
official contrib subpaths mirror KaTeX 0.16.22. `src/fontMetricsData.js` and
`src/unicodeSymbols.js` remain generated host data: they contain no runtime
algorithm or useful type/layout information, and embedding their literals in
LilScript produces a larger Brotli artifact. `npm run audit` checks both files'
generated values against `katex@0.16.22`. All five contrib implementations,
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
