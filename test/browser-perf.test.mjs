import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { runBrowserBench } from "../scripts/lib/browser-bench.mjs"
import { prepareBenchmarkSite } from "../scripts/lib/runtime-bench.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const maxRegressionPercent = Number(process.env.KATEXLIL_MAX_REGRESSION_PERCENT ?? 50)

test("Playwright: original vs LilScript in Chromium, Firefox and WebKit", { timeout: 300000 }, async t => {
  assert.ok(Number.isFinite(maxRegressionPercent) && maxRegressionPercent >= 0, "regression limit must be nonnegative and finite")
  const siteDir = await mkdtemp(join(tmpdir(), "katexlil-browser-"))
  try {
    const manifest = await prepareBenchmarkSite(root, siteDir)
    // Intentionally sequential: concurrent benchmarks compete for the same CPU.
    for (const browserName of ["chromium", "firefox", "webkit"]) {
      for (const comparison of manifest.cases) {
        await t.test(`${browserName} · ${comparison.name}`, async () => {
          const result = await runBrowserBench({ siteDir, browserName, caseId: comparison.id, rounds: Number(process.env.KATEXLIL_BENCH_ROUNDS ?? 20), warmup: 10, batch: 5 })
          assert.deepEqual(result.parity, { compared: 30, mismatches: [] })
          assert.ok(Number.isFinite(result.ratio) && result.ratio > 0)
          for (const lane of Object.values(result.lanes)) assert.equal(lane.samples.length, result.rounds)
          assert.ok(result.ratio <= 1 + maxRegressionPercent / 100, `${result.ratio.toFixed(3)}× time exceeds ${maxRegressionPercent}% regression guard`)
          console.log(`${result.browser} · ${comparison.id}: ${result.ratio.toFixed(3)}× original time`)
        })
      }
    }
  } finally {
    await rm(siteDir, { recursive: true, force: true })
  }
})
