import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { benchmark, corpus, summarize, validateSettings } from "../site/corpus.js"
import { runComparison } from "../site/runtime-benchmark.js"
import { verifyPerformance } from "../scripts/lib/runtime-bench.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

test("benchmark balances lane order, excludes warmup and normalizes batched samples", () => {
  const calls = []
  const lanes = ["official", "itslil"].map(id => ({ id, renderToString: () => { calls.push(id); return "html" } }))
  let tick = 0
  const result = benchmark(lanes, { rounds: 2, warmup: 2, batch: 2, now: () => tick++ })
  const batches = calls.filter((_, index) => index % (corpus.length * 2) === 0)
  assert.deepEqual(batches, ["official", "itslil", "itslil", "official", "official", "itslil", "itslil", "official"])
  assert.deepEqual(result, { official: [0.5, 0.5], itslil: [0.5, 0.5] })
  assert.ok(globalThis.__katexBenchChecksum > 0)
})

test("invalid settings and unusable samples fail instead of producing misleading receipts", () => {
  for (const settings of [{ rounds: 0, warmup: 0, batch: 1 }, { rounds: 2.5, warmup: 1, batch: 1 }, { rounds: 2, warmup: -1, batch: 1 }, { rounds: 2, warmup: 1, batch: NaN }, { rounds: 1000, warmup: 1000, batch: 100 }]) {
    assert.throws(() => validateSettings(settings))
  }
  for (const values of [[], [0], [NaN], [Infinity], [-1]]) assert.throws(() => summarize(values))
  assert.deepEqual(summarize([4, 1, 3, 2]), { median: 3, p10: 1, p90: 4, min: 1, rounds: 4 })
})

test("HTML mismatches and rendering errors abort before performance is reported", async () => {
  const comparison = { id: "test", official: { name: "original" }, itslil: { name: "lil" } }
  const settings = { rounds: 2, warmup: 0, batch: 1 }
  await assert.rejects(runComparison(comparison, async artifact => ({ renderToString: () => artifact.name }), settings), /HTML parity failed/)
  await assert.rejects(runComparison(comparison, async () => ({ renderToString: () => { throw Error("bad formula") } }), settings), /bad formula/)
})

test("published results reject stale artifacts, missing engines and altered statistics", () => {
  const receipt = JSON.parse(readFileSync(resolve(root, "site/performance.json"), "utf8"))
  verifyPerformance(root, receipt)
  const stale = structuredClone(receipt)
  stale.manifest.cases[0].itslil.sha256 = "stale"
  assert.throws(() => verifyPerformance(root, stale), /Performance artifacts or harness changed/)
  const missing = structuredClone(receipt)
  missing.runtimes.pop()
  assert.throws(() => verifyPerformance(root, missing), /all three browsers/)
  const altered = structuredClone(receipt)
  altered.runtimes[0].cases[0].lanes.itslil.median *= 2
  assert.throws(() => verifyPerformance(root, altered))
})
