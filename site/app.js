function $(id) { return document.getElementById(id) }
function copyButtons() {
  for (const button of document.querySelectorAll("[data-copy]")) {
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(button.dataset.copy)
      button.textContent = "copied"
      setTimeout(() => { button.textContent = "copy" }, 1200)
    })
  }
}
function samples(items, apply) {
  const root = $("samples")
  for (const item of items) {
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = item.label
    button.addEventListener("click", () => apply(item.value))
    root.append(button)
  }
}
function showText(value) {
  $("output").hidden = false
  $("output").textContent = value
  $("preview").hidden = true
  $("frame").hidden = true
}
function showHtml(html) {
  $("output").hidden = false
  $("output").textContent = html
  $("preview").hidden = true
  $("frame").hidden = false
  $("frame").srcdoc = `<!doctype html><style>body{font:16px/1.55 system-ui;margin:16px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 8px}blockquote{border-left:3px solid #e3b341;padding-left:12px;color:#555}</style>${html}`
}
function showPreview(html) {
  $("output").hidden = false
  $("preview").hidden = false
  $("frame").hidden = true
  $("preview").innerHTML = html
}
copyButtons()

import { renderToString } from "./katex.js"
const input = $("input")
samples([
  { label: "frac", value: "x^2 + \\frac{a}{b} = \\sqrt{\\alpha}" },
  { label: "matrix", value: "\\begin{matrix} a & b \\\\ c & d \\end{matrix}" },
  { label: "scripts", value: "e^{i\\pi} + 1 = 0" },
], (value) => { input.value = value; render() })
input.value = "x^2 + \\frac{a}{b} = \\sqrt{\\alpha}"
function render() {
  try {
    const html = renderToString(input.value, { displayMode: true, throwOnError: false })
    $("output").textContent = html
    $("output").hidden = false
    showPreview(html)
  } catch (error) { showText(String(error)) }
}
input.addEventListener("input", render)
render()
