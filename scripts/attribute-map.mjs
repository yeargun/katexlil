// Per-module byte attribution, both lanes through real source maps.
//
//   node scripts/attribute-map.mjs [--lil dist/katex.raw.js] [--map dist/katex.raw.js.map] [--json out.json]
//
// LilScript lane: the compiler's own Source Map v3 (`[javascript.source_map] enabled = true`)
// maps every generated token to the `.lil` module that produced it.
// Official lane: katex@<pin>'s Flow sources are type-stripped with Babel, bundled by esbuild
// with a source map, then minified by Terser with the map composed, so every Terser token
// maps to the upstream `src/*.js` module.
// Two numbers per module and lane: raw bytes of the tokens it owns, and its marginal
// Brotli-11 cost (whole artifact minus the artifact with that module's tokens deleted),
// measured with lilscript-codec, the port's pinned encoder.
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { dirname, relative, resolve, join } from "node:path"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { parse } from "@babel/parser"
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping"
import { fromSource, terserOptions, pin, codecPath } from "./lib/official.mjs"

const root = resolve(import.meta.dirname, "..")
const argv = process.argv.slice(2)
const flag = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at === -1 ? fallback : argv[at + 1] }
const lilPath = resolve(root, flag("lil", "dist/katex.raw.js"))
const mapPath = resolve(root, flag("map", `${flag("lil", "dist/katex.raw.js")}.map`))
const codec = codecPath()
const work = resolve(process.env.ATTRIBUTE_WORK ?? join(tmpdir(), "katexlil-attribute"))
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })

// ---- official lane: strip Flow, bundle, minify, all with maps ----
const source = await fromSource({ work: join(work, "official") })
const terser = { code: source.code, map: source.map }

// ---- shared: map tokens to modules ----
function moduleOf(source) {
  if (!source) return "(unmapped)"
  let s = source.replace(/\\/g, "/")
  const at = s.lastIndexOf("/src/")
  if (at !== -1) s = s.slice(at + 1)
  else s = s.split("/").pop()
  return s.replace(/\.(lil|js|mjs)$/, "")
}

// Ownership: `--owner token` charges every token to the module its map entry names (the
// compiler's map sends a property name to the class that declares it, even when the
// reader lives elsewhere). `--owner function`, the default, charges every token to the
// module that owns the innermost enclosing function, and top-level tokens to their own
// map entry: where the bytes live, which is what both lanes' maps agree on.
const ownerMode = flag("owner", "function")

function attribute(code, mapJson) {
  const ast = parse(code, { sourceType: "module", tokens: true, errorRecovery: true })
  const trace = new TraceMap(mapJson)
  const tokens = ast.tokens.filter((t) => t.type?.label !== "eof")
  const mapped = tokens.map((t) => {
    const pos = originalPositionFor(trace, { line: t.loc.start.line, column: t.loc.start.column })
    return pos.source ? moduleOf(pos.source) : null
  })
  const owners = new Array(tokens.length)
  if (ownerMode === "token") {
    let last = "(unmapped)"
    mapped.forEach((m, i) => { if (m) last = m; owners[i] = last })
  } else {
    const starts = tokens.map((t) => t.start)
    const firstTokenAt = (offset) => { let lo = 0, hi = starts.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (starts[mid] < offset) lo = mid + 1; else hi = mid } return lo }
    const spanOwner = (from, to) => { for (let i = from; i < to; i++) if (mapped[i]) return mapped[i]; return "(unmapped)" }
    const claim = (node) => {
      const from = firstTokenAt(node.start), to = firstTokenAt(node.end)
      const owner = spanOwner(from, to)
      for (let i = from; i < to; i++) owners[i] = owner
    }
    const functions = []
    const visit = (node) => {
      if (!node || typeof node !== "object") return
      if (Array.isArray(node)) { for (const child of node) visit(child); return }
      if (!node.type) return
      if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression" || node.type === "ObjectMethod" || node.type === "ClassMethod") functions.push(node)
      for (const key of Object.keys(node)) if (key !== "loc" && key !== "extra" && key !== "leadingComments" && key !== "trailingComments") visit(node[key])
    }
    visit(ast.program.body)
    functions.sort((a, b) => a.start - b.start)
    for (const fn of functions) claim(fn)
    // Top-level tokens outside every function: the module their map entry names, carried
    // forward across unmapped punctuation (a top-level statement of the flat output can hold
    // the whole program, so a statement-level claim would credit one module with everything).
    let last = "(unmapped)"
    for (let i = 0; i < owners.length; i++) {
      if (mapped[i]) last = mapped[i]
      if (!owners[i]) owners[i] = last
    }
  }
  const raw = new Map()
  tokens.forEach((t, i) => raw.set(owners[i], (raw.get(owners[i]) ?? 0) + Buffer.byteLength(code.slice(t.start, t.end))))
  return { ast: { tokens }, owners, raw }
}

function marginalBrotli(label, code, { ast, owners, raw }) {
  const files = [join(work, `${label}.full.js`)]
  writeFileSync(files[0], code)
  const modules = [...raw.keys()]
  for (const module of modules) {
    let out = ""
    let cursor = 0
    ast.tokens.forEach((token, i) => {
      if (owners[i] !== module) return
      out += code.slice(cursor, token.start)
      cursor = token.end
    })
    out += code.slice(cursor)
    const file = join(work, `${label}.minus.${modules.indexOf(module)}.js`)
    writeFileSync(file, out)
    files.push(file)
  }
  const result = spawnSync(codec, ["--json", ...files], { encoding: "utf8", maxBuffer: 1 << 26 })
  if (result.status !== 0) throw new Error(`lilscript-codec failed: ${result.stderr}`)
  const rows = JSON.parse(result.stdout).artifacts
  const full = rows[0]
  const marginal = new Map()
  modules.forEach((module, i) => {
    marginal.set(module, { brotli11: full.brotli11 - rows[i + 1].brotli11, gzip9: full.gzip9 - rows[i + 1].gzip9 })
  })
  return { full, marginal }
}

const official = attribute(terser.code, terser.map)
const officialB = marginalBrotli("official", terser.code, official)
if (argv.includes("--official-only")) {
  console.log(`official(terser) ${officialB.full.raw} raw / ${officialB.full.brotli11} brotli`)
  for (const [m, b] of [...official.raw].sort((a, b) => b[1] - a[1])) console.log(m.padEnd(40), String(b).padStart(8), String(officialB.marginal.get(m).brotli11).padStart(8))
  process.exit(0)
}
const lilCode = readFileSync(lilPath, "utf8")
const lilMap = JSON.parse(readFileSync(mapPath, "utf8"))
const lil = attribute(lilCode, lilMap)
const lilB = marginalBrotli("lil", lilCode, lil)

const modules = new Set([...lil.raw.keys(), ...official.raw.keys()])
const rows = [...modules].map((module) => ({
  module,
  lilRaw: lil.raw.get(module) ?? 0,
  officialRaw: official.raw.get(module) ?? 0,
  lilBrotli: lilB.marginal.get(module)?.brotli11 ?? 0,
  officialBrotli: officialB.marginal.get(module)?.brotli11 ?? 0,
})).map((r) => ({ ...r, deltaRaw: r.lilRaw - r.officialRaw, deltaBrotli: r.lilBrotli - r.officialBrotli }))
  .sort((a, b) => b.deltaBrotli - a.deltaBrotli)

const report = {
  lil: { path: relative(root, lilPath), raw: lilB.full.raw, gzip9: lilB.full.gzip9, brotli11: lilB.full.brotli11 },
  official: { pin, terser: terserOptions, raw: officialB.full.raw, gzip9: officialB.full.gzip9, brotli11: officialB.full.brotli11 },
  rows,
}
const jsonOut = flag("json", null)
if (jsonOut) writeFileSync(resolve(root, jsonOut), JSON.stringify(report, null, 2))

const pad = (s, n) => String(s).padStart(n)
console.log(`lil ${report.lil.raw} raw / ${report.lil.brotli11} brotli   official(terser) ${report.official.raw} raw / ${report.official.brotli11} brotli`)
console.log(`${"module".padEnd(40)} ${pad("lil raw", 9)} ${pad("off raw", 9)} ${pad("Δraw", 8)} ${pad("lil br", 8)} ${pad("off br", 8)} ${pad("Δbr", 7)}`)
for (const r of rows) console.log(`${r.module.padEnd(40)} ${pad(r.lilRaw, 9)} ${pad(r.officialRaw, 9)} ${pad(r.deltaRaw, 8)} ${pad(r.lilBrotli, 8)} ${pad(r.officialBrotli, 8)} ${pad(r.deltaBrotli, 7)}`)
const sum = (k) => rows.reduce((a, r) => a + r[k], 0)
console.log(`${"TOTAL".padEnd(40)} ${pad(sum("lilRaw"), 9)} ${pad(sum("officialRaw"), 9)} ${pad(sum("deltaRaw"), 8)} ${pad(sum("lilBrotli"), 8)} ${pad(sum("officialBrotli"), 8)} ${pad(sum("deltaBrotli"), 7)}`)
