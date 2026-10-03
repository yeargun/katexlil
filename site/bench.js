import { defaults, runComparison } from "./runtime-benchmark.js"

const params = new URLSearchParams(location.search)
const settings = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, Number(params.get(key) ?? value)]))
const status = document.querySelector("#status")
const table = document.querySelector("#rows")
const again = document.querySelector("#again")
const selector = document.querySelector("#comparison")
const fmt = n => `${n.toFixed(3)} ms`
let manifest

export async function run() {
  again.disabled = true
  selector.disabled = true
  window.__benchResult = null
  window.__benchError = null
  table.replaceChildren()
  try {
    if (!manifest) {
      const response = await fetch("./runtime-manifest.json")
      if (!response.ok) throw new Error(`Manifest could not load: ${response.status}`)
      manifest = await response.json()
      for (const comparison of manifest.cases) selector.add(new Option(comparison.name, comparison.id))
      selector.value = params.get("case") ?? "shipped"
      if (!selector.value) throw new Error("Unknown comparison")
    }
    const comparison = manifest.cases.find(row => row.id === selector.value)
    status.textContent = `Checking parity, then ${settings.rounds} rounds × ${settings.batch} corpus passes per lane, after ${settings.warmup} warmup rounds…`
    await new Promise(resolve => setTimeout(resolve, 0))
    const result = await runComparison(comparison, artifact => import(artifact.url), settings)
    for (const lane of Object.values(result.lanes)) {
      const tr = document.createElement("tr")
      for (const [index, value] of [lane.name, fmt(lane.median), fmt(lane.p10), fmt(lane.p90), Math.round(lane.expressionsPerSecond).toLocaleString("en-US")].entries()) {
        const cell = document.createElement(index === 0 ? "th" : "td")
        if (index === 0) cell.scope = "row"
        cell.textContent = value
        tr.append(cell)
      }
      table.append(tr)
    }
    status.textContent = `LilScript / original time: ${result.ratio.toFixed(3)}× (lower is better). HTML parity: ${result.parity.compared}/${result.corpus}. Times are per corpus, excluding load, DOM layout and paint.`
    window.__benchResult = { ...result, userAgent: navigator.userAgent }
    return window.__benchResult
  } catch (error) {
    status.textContent = String(error?.stack ?? error)
    window.__benchError = String(error)
  } finally {
    again.disabled = false
    selector.disabled = false
  }
}

again.addEventListener("click", run)
selector.addEventListener("change", run)
run()
