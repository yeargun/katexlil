# @itslil/katex

Official [`katex@0.16.22`](https://github.com/KaTeX/KaTeX) algorithms rewritten in LilScript. Official Jest suite 1013/1013. Not affiliated with upstream.

**Site:** [yeargun.github.io/katexlil/](https://yeargun.github.io/katexlil/)

```sh
npm install @itslil/katex
```

Two compiles ship from the same `.lil` source:

| Lane | Config | Meaning |
| --- | --- | --- |
| **library** (npm) | `lilscript.toml` · `--target js-module` | reusable ESM. Export names and `extern class` keys stay. |
| **closed** | `lilscript.closed.toml` · `--target js-module` | closed LilScript world. `extern class` keys may mangle. ESM export names stay so the lane is testable. |

You publish the library lane. The closed artifact is `dist/katex.closed.js`.

The LilScript compiler lives next door at `../lilscript`.
