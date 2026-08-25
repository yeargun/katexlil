import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

describe("@itslil/katex", () => {
  it("renders x^2 with katex classes", async () => {
    const { renderToString } = await import("../dist/katex.esm.js")
    const html = renderToString("x^2")
    assert.match(html, /katex/)
    assert.match(html, /2/)
    assert.match(html, /msubsup|msupsub/)
  })

  it("renders frac", async () => {
    const { renderToString } = await import("../dist/katex.esm.js")
    const html = renderToString("\\frac{a}{b}")
    assert.match(html, /mfrac/)
    assert.match(html, /a/)
    assert.match(html, /b/)
  })

  it("exposes default object methods", async () => {
    const mod = await import("../dist/katex.esm.js")
    assert.equal(typeof mod.renderToString, "function")
    assert.equal(typeof mod.render, "function")
    assert.equal(typeof mod.default.renderToString, "function")
    assert.equal(mod.default.renderToString, mod.renderToString)
  })

  it("honors throwOnError and errorColor", async () => {
    const { renderToString } = await import("../dist/katex.esm.js")
    assert.throws(() => renderToString("\\unknowncmd"))
    const html = renderToString("\\unknowncmd", { throwOnError: false, errorColor: "#00aa00" })
    assert.match(html, /#00aa00/)
    assert.match(html, /unknowncmd/)
  })

  it("pins option keys on the library artifact", () => {
    const src = readFileSync(resolve(root, "dist/katex.esm.js"), "utf8")
    assert.match(src, /displayMode/)
    assert.match(src, /throwOnError/)
    assert.match(src, /errorColor/)
    assert.match(src, /innerHTML/)
  })

  it("render writes innerHTML and covers the TeX subset", async () => {
    const { render, renderToString } = await import("../dist/katex.esm.js")
    const el = { innerHTML: "" }
    render("x^2", el)
    assert.match(el.innerHTML, /katex/)
    const sample = [
      "\\sqrt{\\alpha}+\\sum\\prod\\int",
      "\\sin\\cos\\tan\\log\\ln",
      "\\cdot\\times\\div\\pm\\infty",
      "\\neq\\leq\\geq\\approx\\in\\to\\rightarrow\\ldots",
      "\\left( a \\right)",
      "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
      "\\text{hi}\\mathrm{dx}a\\,b\\;c\\quad d",
    ].join(" ")
    const html = renderToString(sample)
    assert.match(html, /katex/)
    assert.equal(html.includes("katex-error"), false)
  })

  it("closed artifact performs the core call", async () => {
    const closedPath = resolve(root, "dist/katex.closed.js")
    assert.equal(existsSync(closedPath), true)
    const closed = await import("../dist/katex.closed.js")
    const html = closed.renderToString("x^2")
    assert.match(html, /katex/)
    assert.match(html, /2/)
  })
})
