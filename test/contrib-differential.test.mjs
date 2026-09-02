import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function outcome(callback) {
  try {
    return { value: callback() }
  } catch (error) {
    return { error: String(error) }
  }
}

describe("contrib LilScript parity", () => {
  it("contains no runtime JavaScript host modules", () => {
    for (const name of ["mhchem/mhchem", "render-a11y-string/render-a11y-string"]) {
      assert.equal(existsSync(resolve(root, `contrib/${name}.lil`)), true)
      assert.equal(existsSync(resolve(root, `contrib/${name}.host.mjs`)), false)
    }
  })

  it("matches official render-a11y-string outputs and errors", async () => {
    const local = (await import("../dist/contrib/render-a11y-string.mjs")).default
    const official = (await import("katex/contrib/render-a11y-string")).default
    const expressions = [
      "1 + 2",
      "\\vec{a}",
      "\\acute{a}",
      "\\underleftarrow{1+2}",
      "\\color{red}1+2",
      "\\textcolor{red}1+2",
      "\\left(\\frac{1}{x}\\right)",
      "\\bigl(1+2\\bigr)",
      "\\cancel{a}",
      "\\fbox{a}",
      "\\sout{a}",
      "\\phase{a}",
      "e^x",
      "90^{\\circ}",
      "\\log_2{x+1}",
      "a_{n+1}",
      "\\frac{1}{1+\\frac{1}{x}}",
      "\\binom{n}{k}",
      "\\overbrace{1+2}",
      "a \\choose b",
      "x+\\hbox{y}",
      "\\left(a\\middle|b\\right)",
      "\\sum_{i=0}",
      "\\limsup",
      "\\phantom{2}",
      "\\rule{1em}{1em}",
      "\\sqrt{x+\\sqrt{y}}",
      "\\sqrt[3]{x+1}",
      "\\sqrt[n]{x+1}",
      "\\textbf{hello}",
      "\\underline{1+2}",
      "\\verb|hello|",
      "\\begin{matrix}a&b\\\\c&d\\end{matrix}",
    ]
    for (const expression of expressions) {
      assert.deepEqual(outcome(() => local(expression)), outcome(() => official(expression)), expression)
    }
  })

  it("matches official mhchem rendering across parser state machines", async () => {
    const local = (await import("../dist/katex.mjs")).default
    await import("../dist/contrib/mhchem.mjs")
    const official = (await import("katex")).default
    await import("katex/contrib/mhchem")
    const expressions = [
      "\\ce{H2O}",
      "\\ce{CO2 + C -> 2 CO}",
      "\\ce{^{227}_{90}Th+}",
      "\\ce{SO4^2-}",
      "\\ce{Fe^{II}Fe^{III}2O4}",
      "\\ce{A <=> B}",
      "\\ce{A ->[above][below] B}",
      "\\ce{CH3-CH2-OH}",
      "\\ce{CuSO4.5H2O}",
      "\\ce{alpha-Fe2O3}",
      "\\ce{AgCl (s)}",
      "\\ce{\\frac{1}{2} O2}",
      "\\ce{\\color{red}{H2O}}",
      "\\ce{A \\bond{~--} B}",
      "\\ce{A \\bond{...} B}",
      "\\pu{1.2e3 kg.m-3}",
      "\\pu{12345.678 mol//L}",
      "\\pu{2.3(4)e-2 m2 s-1}",
      "\\pu{25 ^oC}",
      "\\pu{1 kg m / s2}",
    ]
    for (const expression of expressions) {
      assert.deepEqual(
        outcome(() => local.renderToString(expression)),
        outcome(() => official.renderToString(expression)),
        expression,
      )
    }
  })
})
