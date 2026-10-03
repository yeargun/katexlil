import { corpus, options, benchmark, summarize, parity, validateSettings } from "./corpus.js"

// Longer samples reduce the effect of Firefox/WebKit's coarser browser clocks.
export const defaults = { rounds: 40, warmup: 10, batch: 50 }

export async function runComparison(comparison, loadModule, settings = defaults) {
  validateSettings(settings)
  const lanes = []
  for (const id of ["official", "itslil"]) {
    const artifact = comparison[id]
    const module = await loadModule(artifact)
    const renderToString = module.renderToString ?? module.default?.renderToString
    if (typeof renderToString !== "function") throw new Error(`Missing renderToString: ${artifact.url}`)
    lanes.push({ id, name: artifact.name, renderToString })
  }
  const same = parity(lanes)
  if (same.mismatches.length) throw new Error(`HTML parity failed: ${JSON.stringify(same.mismatches)}`)
  const times = benchmark(lanes, settings)
  const summaries = Object.fromEntries(lanes.map(lane => {
    const summary = summarize(times[lane.id])
    return [lane.id, { name: lane.name, ...summary, expressionsPerSecond: corpus.length * 1000 / summary.median, samples: times[lane.id] }]
  }))
  return {
    id: comparison.id,
    name: comparison.name,
    corpus: corpus.length,
    options,
    ...settings,
    parity: same,
    lanes: summaries,
    ratio: summaries.itslil.median / summaries.official.median,
    checksum: globalThis.__katexBenchChecksum,
  }
}
