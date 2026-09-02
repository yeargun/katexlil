// Performance and parity of the shipped ESM against katex@0.16.22 in a real browser.
// Playwright drives site/bench.html in headless Chromium (the same page anyone can open at
// https://yeargun.github.io/katexlil/bench.html). Fails if any corpus expression renders
// different HTML, or if the port is slower than the guard rail.
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { describe, it } from "node:test"
import { runBrowserBench } from "../scripts/lib/browser-bench.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const siteDir = resolve(root, "_site")
// Runtime performance is a constraint, not the objective: the port may not be more than this
// much slower than upstream on the corpus. Override with KATEXLIL_MAX_REGRESSION_PERCENT.
const maxRegressionPercent = Number(process.env.KATEXLIL_MAX_REGRESSION_PERCENT ?? 50)

describe("browser performance (Playwright, Chromium)", () => {
  it("renders the corpus identically and within the regression guard rail", async () => {
    if (!existsSync(resolve(siteDir, "bench.html"))) {
      const built = spawnSync(process.execPath, [resolve(root, "scripts/build-site.mjs")], { cwd: root, stdio: "inherit" })
      assert.equal(built.status, 0, "build-site failed")
    }
    const result = await runBrowserBench({ siteDir, rounds: Number(process.env.KATEXLIL_BENCH_ROUNDS ?? 20) })
    const lil = result.lanes.itslil
    const official = result.lanes.official
    console.log(`${result.browser}: ${lil.name} median ${lil.median.toFixed(2)} ms, ${official.name} median ${official.median.toFixed(2)} ms, ratio ${result.ratio.toFixed(3)}; parity ${result.parity.compared - result.parity.mismatches.length}/${result.parity.compared}`)
    assert.deepEqual(result.parity.mismatches, [], "both lanes must render identical HTML for every corpus expression")
    assert.ok(
      result.ratio <= 1 + maxRegressionPercent / 100,
      `port is ${((result.ratio - 1) * 100).toFixed(1)}% slower than upstream; guard rail is ${maxRegressionPercent}%`,
    )
  })
})
