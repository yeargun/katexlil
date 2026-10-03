const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
const ms = value => value.toFixed(3)
const rate = value => Math.round(value).toLocaleString("en-US")

function table(data, caseId) {
  const comparison = data.manifest.cases.find(row => row.id === caseId)
  return `<div class="table-wrap objective-table"><table><caption>${escape(comparison.name)} · Original: ${escape(comparison.official.name)}</caption>
    <thead><tr><th scope="col">Runtime</th><th scope="col">Original ms<br><small>median · p10–p90</small></th><th scope="col">LilScript ms<br><small>median · p10–p90</small></th><th scope="col">Lil / original time</th><th scope="col">Expressions/s<br><small>original / LilScript</small></th><th scope="col">HTML parity</th></tr></thead>
    <tbody>${data.runtimes.map(runtime => {
      const result = runtime.cases.find(row => row.id === caseId)
      const original = result.lanes.official, lil = result.lanes.itslil
      const timing = lane => `<strong>${ms(lane.median)}</strong><br><small>${ms(lane.p10)}–${ms(lane.p90)}</small>`
      const difference = `${(Math.abs(result.ratio - 1) * 100).toFixed(1)}% ${result.ratio <= 1 ? "less" : "more"} time`
      return `<tr data-runtime="${runtime.id}" data-case="${caseId}"><th scope="row">${escape(runtime.name)}<br><small>${escape(runtime.version)}</small></th><td>${timing(original)}</td><td>${timing(lil)}</td><td class="verdict ${result.ratio <= 1 ? "win" : "loss"}"><strong>${result.ratio.toFixed(3)}×</strong><br><small>${difference}</small></td><td>${rate(original.expressionsPerSecond)} / ${rate(lil.expressionsPerSecond)}</td><td>${result.parity.compared - result.parity.mismatches.length}/${result.corpus}</td></tr>`
    }).join("")}</tbody></table></div>`
}

export async function renderPerformance() {
  const root = document.querySelector("#runtime-performance")
  try {
    const response = await fetch("./performance.json")
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    const { rounds, warmup, batch } = data.settings
    root.innerHTML = `${table(data, "shipped")}
      <p class="objective-note">Lower time is better. Each sample renders the same 30 valid expressions ${batch} times; times above are normalized to one corpus. ${rounds} measured rounds after ${warmup} warmup rounds, alternating which implementation runs first. All expressions must produce identical HTML before timing starts.</p>
      <p class="objective-note">${escape(data.scope)} Results are observations on this machine, not speed guarantees. The original baseline is the minified upstream ESM artifact named above; Node and browsers load exactly the same bytes.</p>
      <details class="objective-details"><summary>All three compiler objectives in every runtime</summary>${["raw", "gzip", "brotli"].map(id => table(data, id)).join("")}<p class="objective-note">Each objective uses its matching original artifact from the size comparison. The original minifier is selected for size, not runtime speed.</p></details>
      <p class="objective-note">${escape(data.machine.cpu)} · ${data.machine.logicalCpus} logical CPUs · ${data.machine.memoryGiB} GiB RAM · ${escape(data.machine.os)}. Measured ${escape(data.measuredAt)}. Playwright ${escape(data.runtimes.find(row => row.playwright)?.playwright ?? "—")}; headless Chromium, Firefox and WebKit.</p>
      <p class="objective-note"><a href="./bench.html">Run in your browser ↗</a> · <a href="./performance.json">Raw samples, artifact hashes and environment ↗</a> · <a href="https://github.com/yeargun/katexlil/blob/main/scripts/measure-runtime.mjs">Benchmark source ↗</a></p>
      <details class="objective-details"><summary>Reproduce the measurements</summary><pre><code>npm ci
npx playwright install chromium firefox webkit
npm run bench
npm run check:site</code></pre><p>Node only: <code>npm run bench:node</code>. Browsers only: <code>npm run bench:browser</code>. Partial runs write separate receipts in <code>.tmp/</code>.</p></details>`
  } catch (error) {
    root.textContent = `Performance results could not load: ${error.message}`
  }
}
