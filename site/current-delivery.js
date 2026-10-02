// Current delivered artifacts and their pinned upstream comparison.
const format = new Intl.NumberFormat("en-US")
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))
export function renderDelivery(data, selector) {
  const root = document.querySelector(selector)
  if (!root) return
  const delivered = data.delivered ?? []
  const primary = (data.size ?? []).find(row => row.primary)
  const bars = (data.size ?? []).filter(row => (row.id.startsWith("official-") || row.id.startsWith("parse-")) && !row.diagnostic)
  const cards = primary && bars.length ? ["raw", "gzip9", "brotli11"].map(metric => {
    const baseline = bars.reduce((a,b) => a[metric] < b[metric] ? a : b)
    const ratio = (primary[metric] / baseline[metric]).toFixed(3)
    return `<article class="perf-card"><strong>${ratio}×</strong><span>${escape(metric)} versus ${escape(baseline.name)}</span></article>`
  }).join("") : ""
  root.innerHTML = `<div class="perf-cards">${cards}</div><div class="table-wrap light"><table><thead><tr><th>Delivered file</th><th>Loaded by</th><th>Written by</th><th>Raw</th><th>gzip-9</th><th>Brotli-11</th></tr></thead><tbody>${delivered.map(file => `<tr><th scope="row"><code>${escape(file.path ?? file.file)}</code></th><td>${escape(file.condition ?? file.role ?? file.format)}</td><td>${escape(file.writtenBy)}</td><td>${format.format(file.raw)}</td><td>${format.format(file.gzip9)}</td><td>${format.format(file.brotli11)}</td></tr>`).join("")}</tbody></table></div><p class="method-note">Current delivered files, measured with the same raw, gzip-9 and Brotli-11 encoder as the original package. Ratios below 1 mean fewer bytes. Package and dependency boundaries are described in the comparison table.</p>`
}
