// The benchmark corpus: one document of typical KaTeX input, rendered whole per round.
// Shared by site/bench.js (browser, Playwright) and scripts/measure-site.mjs (Node).
export const options = { displayMode: true, throwOnError: false }
export const corpus = [
  "x^2 + \\frac{a}{b} = \\sqrt{\\alpha}",
  "e^{i\\pi} + 1 = 0",
  "\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}",
  "\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}",
  "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}",
  "f(x) = \\begin{cases} x^2 & x \\ge 0 \\\\ -x & \\text{otherwise} \\end{cases}",
  "\\begin{aligned} a &= b + c \\\\ &= d \\end{aligned}",
  "\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1",
  "\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}, \\quad \\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J}",
  "\\left( \\frac{1}{1 + \\left| x \\right|} \\right)^{n}",
  "\\sqrt[3]{x^3 + y^3} \\neq x + y",
  "\\binom{n}{k} = \\frac{n!}{k!(n-k)!}",
  "\\hat{a} \\bar{b} \\vec{c} \\tilde{d} \\dot{e} \\ddot{f} \\overline{gh} \\underline{ij}",
  "\\color{red}{x} + \\textcolor{blue}{y} = \\colorbox{yellow}{z}",
  "\\mathbb{R}^n \\subseteq \\mathcal{H} \\cong \\mathfrak{g} \\oplus \\mathsf{S}",
  "\\overbrace{a + b + c}^{\\text{sum}} + \\underbrace{d \\cdot e}_{\\text{product}}",
  "\\displaystyle \\prod_{i=1}^{n} \\left( 1 + \\frac{1}{i} \\right) = n + 1",
  "\\def\\foo#1{\\mathrm{foo}(#1)} \\foo{x} + \\foo{y}",
  "\\ce{H2O}\\text{ is water; } \\operatorname{sinc}(x) = \\frac{\\sin x}{x}",
  "\\begin{array}{c|cc} & 0 & 1 \\\\ \\hline 0 & 0 & 1 \\\\ 1 & 1 & 0 \\end{array}",
  "\\xrightarrow{\\text{heat}} \\quad \\overset{?}{=} \\quad \\underset{n \\to \\infty}{\\to}",
  "\\boxed{E = mc^2} \\qquad \\cancel{x} \\quad \\sout{y}",
  "\\frac{\\partial^2 u}{\\partial t^2} = c^2 \\frac{\\partial^2 u}{\\partial x^2}",
  "\\iint_D f(x, y) \\, dA = \\oint_{\\partial D} \\mathbf{F} \\cdot d\\mathbf{r}",
  "\\text{Greek: } \\alpha\\beta\\gamma\\delta\\epsilon\\zeta\\eta\\theta \\Gamma\\Delta\\Theta\\Lambda\\Xi\\Pi\\Sigma\\Omega",
  "\\begin{vmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{vmatrix} = 1",
  "\\mathrm{softmax}(z)_i = \\frac{e^{z_i}}{\\sum_j e^{z_j}}",
  "\\phantom{x}\\rule{1em}{0.5em} \\kern1em \\raisebox{2pt}{\\text{up}}",
  "\\stackrel{\\text{def}}{=} \\quad \\substack{a \\\\ b} \\quad \\genfrac(]{0pt}{1}{a}{b}",
  "\\Big( \\bigg[ \\Bigg\\{ x \\Bigg\\} \\bigg] \\Big) \\lVert v \\rVert \\langle u, v \\rangle",
]

// Renders the whole corpus once with `renderToString`; returns the HTML strings.
export function renderCorpus(renderToString) {
  const out = new Array(corpus.length)
  for (let i = 0; i < corpus.length; i++) out[i] = renderToString(corpus[i], options)
  return out
}

// Interleaved benchmark: every round renders the corpus once per lane, lanes alternating,
// so JIT warmth, GC and clock drift fall on both equally. Returns per-lane round times.
export function benchmark(lanes, { rounds = 30, warmup = 5, now = () => performance.now() } = {}) {
  const times = Object.fromEntries(lanes.map((lane) => [lane.id, []]))
  for (let round = -warmup; round < rounds; round++) {
    for (const lane of lanes) {
      const start = now()
      renderCorpus(lane.renderToString)
      const elapsed = now() - start
      if (round >= 0) times[lane.id].push(elapsed)
    }
  }
  return times
}

export function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return { median: at(0.5), p10: at(0.1), p90: at(0.9), min: sorted[0], rounds: sorted.length }
}

export function parity(lanes) {
  const rendered = lanes.map((lane) => renderCorpus(lane.renderToString))
  const mismatches = []
  for (let i = 0; i < corpus.length; i++) {
    for (let l = 1; l < lanes.length; l++) {
      if (rendered[l][i] !== rendered[0][i]) mismatches.push({ index: i, source: corpus[i], lanes: [lanes[0].id, lanes[l].id] })
    }
  }
  return { compared: corpus.length, mismatches }
}
