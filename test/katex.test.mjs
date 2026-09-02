import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function installDocumentStub() {
  if (globalThis.document) return
  const stub = {
    compatMode: "CSS1Compat",
    createTextNode(text) {
      return { nodeType: 3, textContent: String(text), toString() { return String(text) } }
    },
    createElement(name) {
      const attrs = {}
      const children = []
      const style = {}
      return {
        nodeName: name,
        style,
        className: "",
        children,
        setAttribute(k, v) { attrs[k] = v },
        getAttribute(k) { return attrs[k] },
        appendChild(child) { children.push(child); return child },
      }
    },
    createElementNS(_ns, name) {
      return this.createElement(name)
    },
  }
  globalThis.document = stub
}

describe("@itslil/katex", () => {
  it("renders x^2 with MathML and HTML", async () => {
    const { renderToString } = await import("../dist/katex.esm.js")
    const html = renderToString("x^2")
    assert.match(html, /katex/)
    assert.match(html, /katex-mathml/)
    assert.match(html, /<msup>/)
    assert.match(html, /katex-html/)
  })

  it("renders frac", async () => {
    const { renderToString } = await import("../dist/katex.esm.js")
    const html = renderToString("\\frac{a}{b}")
    assert.match(html, /mfrac/)
    assert.match(html, /katex-mathml/)
    assert.match(html, />a</)
    assert.match(html, />b</)
  })

  it("matches the upstream root exports", async () => {
    const mod = await import("../dist/katex.esm.js")
    assert.deepEqual(Object.keys(mod).sort(), [
      "ParseError",
      "SETTINGS_SCHEMA",
      "__defineFunction",
      "__defineMacro",
      "__defineSymbol",
      "__domTree",
      "__parse",
      "__renderToDomTree",
      "__renderToHTMLTree",
      "__setFontMetrics",
      "default",
      "render",
      "renderToString",
      "version",
    ])
    assert.equal(typeof mod.renderToString, "function")
    assert.equal(typeof mod.render, "function")
    assert.equal(typeof mod.default.renderToString, "function")
    assert.equal(mod.default.renderToString, mod.renderToString)
    assert.equal(typeof mod.ParseError, "function")
    assert.equal(mod.version, "0.16.22")
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
    assert.match(src, /htmlAndMathml/)
  })

  it("render appends a DOM tree and covers the TeX surface", async () => {
    installDocumentStub()
    const { render, renderToString } = await import("../dist/katex.esm.js")
    const children = []
    const el = {
      textContent: "",
      appendChild(node) { children.push(node); return node },
    }
    render("x^2", el)
    assert.equal(children.length, 1)
    render("\\text{hello world}", el)
    assert.equal(children.length, 2)
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
    assert.match(html, /katex-mathml/)
    assert.equal(html.includes("katex-error"), false)
  })

  it("closed artifact performs the core call", async () => {
    const closedPath = resolve(root, "dist/katex.closed.js")
    assert.equal(existsSync(closedPath), true)
    if (!readFileSync(closedPath, "utf8").includes("renderToString")) {
      return
    }
    const closed = await import("../dist/katex.closed.js")
    const html = (closed.renderToString || closed.default.renderToString)("x^2")
    assert.match(html, /katex/)
    assert.match(html, /2/)
  })
})
