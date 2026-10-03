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
| **closed world** | `lilscript.closed.toml` · `--target js-module` | diagnostic configuration, presently equivalent to the npm lane. ESM export names stay as written. |

The package exports the open-world library. The diagnostic closed build is measured separately; public API and option keys remain callable from JavaScript.

The LilScript compiler lives next door at `../lilscript`.

## Comparison with the original

See [COMPARISON.md](COMPARISON.md) for current raw-, gzip- and Brotli-objective builds, minified upstream comparisons, build times and validation.

## Runtime benchmarks

The [performance section](https://yeargun.github.io/katexlil/#performance) compares
the original KaTeX with LilScript in Node.js and actual headless Chromium,
Firefox and WebKit browsers driven by Playwright. Run all four sequentially:

```sh
npm ci
npx playwright install chromium firefox webkit
npm run bench
npm run check:site
```

On Linux, use `npx playwright install --with-deps chromium firefox webkit`.
No LilScript compiler is needed: benchmarks use the checked JavaScript artifacts.
`npm run bench:node` and `npm run bench:browser` run subsets and save separate
receipts under `.tmp/`. Customize a run with
`npm run bench -- --rounds 60 --warmup 15 --batch 50 --output .tmp/performance.json`.
Only a complete run can replace the published `site/performance.json`.

Each runtime measures the shipped package ESM and the raw, gzip and Brotli
objective builds. The shipped baseline is upstream KaTeX 0.16.22 minified by
Terser; each objective uses its original artifact from the size comparison
(selected for size, not runtime speed). Node and browsers load identical bytes.
Each comparison gets a fresh Node process or browser, and all comparisons run
sequentially. Imports, network, DOM insertion, layout and paint are excluded:
this is warm `renderToString` throughput.

Before timing, every one of the 30 valid formulas must produce identical HTML.
The default run has 10 warmup rounds followed by 40 measured rounds, each
rendering the corpus 50 times per implementation to reduce clock quantization.
The starting implementation
alternates each round, and output lengths are consumed. Times are normalized to
one corpus. Receipts include every sample, median, p10/p90, expressions per
second, LilScript/original time ratio, versions, machine details and artifact
and harness SHA-256 hashes. The site build rejects stale or incomplete receipts.
Results describe one machine and workload, not a universal speed guarantee.

The [live benchmark](https://yeargun.github.io/katexlil/bench.html) uses the same
runner and allows selecting each build. `npm run test:browser` checks every
comparison in all three browsers and preserves the existing 50% maximum
regression guard. Override it with
`KATEXLIL_MAX_REGRESSION_PERCENT=25 npm run test:browser`.
The Runtime benchmarks GitHub Actions workflow records all four runtimes and
uploads its fresh receipt without replacing the published machine's results.

## The site and its receipts

The root API, CLI, TypeScript declarations, CSS, 60 font files, and all five
official contrib subpaths mirror KaTeX 0.16.22. The font metrics are LilScript
data: `src/data.lil` holds upstream's generated table as an object literal, and the
compiler chooses its encoding against the configured compression objective. `src/fontMetricsData.js`,
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

Run `npm run check` for build, TypeScript, official and differential tests,
package, site, and parity checks. `npm run audit` reports the complete
upstream-module to `.lil` map, generated-data and asset hashes, declaration/export checks, and raw,
gzip-9, and Brotli-11 sizes for core and contrib artifacts. ESM, CommonJS and browser-global JavaScript files are written by the compiler’s delivery pipeline. Contrib entries, aliases and external host assets are recorded in [the checked package build](site/package-build.json); no JavaScript post-minifier runs over compiler output.

[Download the checked repository package](https://yeargun.github.io/katexlil/downloads/package.tgz) · [Package files, hashes and validation](https://yeargun.github.io/katexlil/package-build.json). npm publication is independent.
