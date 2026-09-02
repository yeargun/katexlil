// Browser benchmark: the same corpus, both lanes, interleaved rounds. Playwright drives this
// page (test/browser-perf.test.mjs, scripts/measure-site.mjs); people can open it too.
import { corpus, benchmark, summarize, parity } from "./corpus.js"

const params = new URLSearchParams(location.search)
const rounds = Number(params.get("rounds") ?? 30)
const warmup = Number(params.get("warmup") ?? 5)
const status = document.querySelector("#status")
const table = document.querySelector("#rows")
const fmt = (n) => `${n.toFixed(2)} ms`

async function loadLanes() {
  const results = await fetch("./results.json").then((r) => r.json())
  const lil = await import(`./${results.file}.js`)
  const official = await import("./official.js")
  const pick = (mod, name) => (name && mod[name]) || mod.default?.[name] || mod.default || mod
  return [
    { id: "itslil", name: results.package, renderToString: pick(lil, results.lilExport) },
    { id: "official", name: results.pin, renderToString: official.default?.renderToString ?? official.renderToString },
  ]
}

export async function run() {
  status.textContent = `loading both lanes…`
  const lanes = await loadLanes()
  status.textContent = `checking parity on ${corpus.length} expressions…`
  await new Promise((r) => setTimeout(r, 0))
  const same = parity(lanes)
  status.textContent = `rendering ${corpus.length} expressions × ${rounds} rounds per lane (interleaved, ${warmup} warmup)…`
  await new Promise((r) => setTimeout(r, 0))
  const times = benchmark(lanes, { rounds, warmup })
  const summary = Object.fromEntries(lanes.map((lane) => [lane.id, { name: lane.name, ...summarize(times[lane.id]) }]))
  const result = {
    userAgent: navigator.userAgent,
    corpus: corpus.length,
    rounds,
    warmup,
    parity: same,
    lanes: summary,
    ratio: summary.itslil.median / summary.official.median,
  }
  table.innerHTML = lanes
    .map((lane) => {
      const s = summary[lane.id]
      return `<tr><th scope="row">${lane.name}</th><td>${fmt(s.median)}</td><td>${fmt(s.p10)}</td><td>${fmt(s.p90)}</td></tr>`
    })
    .join("")
  const pct = ((result.ratio - 1) * 100).toFixed(1)
  status.textContent = `${lanes[0].name} renders the corpus in ${(result.ratio * 100).toFixed(0)}% of ${lanes[1].name}'s time (${pct > 0 ? "+" : ""}${pct}%). Parity: ${same.compared - same.mismatches.length}/${same.compared} identical HTML.`
  window.__benchResult = result
  return result
}

document.querySelector("#again").addEventListener("click", () => { window.__benchResult = null; run() })
run().catch((error) => { status.textContent = String(error?.stack ?? error); window.__benchError = String(error) })
