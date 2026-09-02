// Bottom-up at the boundary both lanes share: every top-level function, class and class method,
// paired by its original name through the two source maps, each body compressed alone.
//   node scripts/function-pairs.mjs [--lil dist/katex.raw.js] [--terser <official.terser.js>] [--out <dir>] [--json <file>]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { parse } from "@babel/parser"
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping"
import { codecPath, root } from "./lib/official.mjs"

const argv = process.argv.slice(2)
const flag = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at === -1 ? fallback : argv[at + 1] }
const lilPath = resolve(root, flag("lil", "dist/katex.raw.js"))
const terserPath = resolve(flag("terser", "/tmp/katexlil-attribute/official/official.terser.js"))
const out = resolve(flag("out", join(tmpdir(), "katexlil-function-pairs")))
mkdirSync(join(out, "lil"), { recursive: true }); mkdirSync(join(out, "terser"), { recursive: true })

const moduleOf = (s) => { if (!s) return "?"; let x = s.replace(/\\/g, "/"); const at = x.lastIndexOf("/src/"); x = at !== -1 ? x.slice(at + 5) : x.split("/").pop(); return x.replace(/\.(lil|js)$/, "") }
const stripM = (n) => n.replace(/^\$m\d+\$/, "")

// Every outermost function body in the artifact is one unit, wherever it sits (a top-level
// binding, an object property, a class method, an argument): both lanes then contain every
// function exactly once, whatever each chose to hoist or inline, and the per-module sums are
// comparable. The module is the map's source at the function's first token; the name is the
// map's original name at the binding, property key or method key when it has one.
function collect(code, trace, nameAt) {
  const ast = parse(code, { sourceType: "module", errorRecovery: true })
  const units = []
  const FN = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ObjectMethod", "ClassMethod", "ClassPrivateMethod"])
  const posOf = (loc) => originalPositionFor(trace, { line: loc.line, column: loc.column })
  const walk = (node, label) => {
    if (!node || typeof node !== "object") return
    if (Array.isArray(node)) { for (const c of node) walk(c, label); return }
    if (!node.type) return
    if (FN.has(node.type)) {
      const pos = posOf(node.loc.start)
      const key = node.key ?? node.id
      let name = label
      if (key && key.loc) { const p = posOf(key.loc.start); name = p.name ?? key.name ?? key.value ?? label }
      units.push({ name: name ?? "(anonymous)", module: moduleOf(pos.source), text: code.slice(node.start, node.end), start: node.start, end: node.end })
      return // nested functions belong to this unit
    }
    let childLabel = label
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") { const p = posOf(node.id.loc.start); childLabel = p.name ?? nameAt?.(node.id.name) ?? node.id.name }
    if (node.type === "AssignmentExpression" && node.left.type === "Identifier") { const p = posOf(node.left.loc.start); childLabel = p.name ?? nameAt?.(node.left.name) ?? node.left.name }
    if (node.type === "AssignmentExpression" && node.left.type === "MemberExpression") { const pr = node.left.property; childLabel = pr.name ?? pr.value ?? label }
    if (node.type === "ObjectProperty" && node.key) childLabel = node.key.name ?? node.key.value ?? label
    for (const k of Object.keys(node)) if (k !== "loc" && k !== "extra" && k !== "leadingComments" && k !== "trailingComments") walk(node[k], childLabel)
  }
  walk(ast.program.body, null)
  return units
}

// LilScript: generated global name -> original via x_lilscript.mangledNames
const lilCode = readFileSync(lilPath, "utf8")
const lilMap = JSON.parse(readFileSync(lilPath + ".map", "utf8"))
const gen2orig = new Map()
for (const r of lilMap.x_lilscript.mangledNames) if (r.kind === "global") if (!gen2orig.has(r.generated)) gen2orig.set(r.generated, { name: stripM(r.original), module: moduleOf(r.source) })
const lilTrace = new TraceMap(lilMap)
const lilUnits = collect(lilCode, lilTrace, (generated) => gen2orig.get(generated)?.name)
for (const u of lilUnits) u.name = stripM(u.name)
// Terser: original name from the map's names at the identifier position
const terserCode = readFileSync(terserPath, "utf8")
const terserTrace = new TraceMap(JSON.parse(readFileSync(terserPath + ".map", "utf8")))
const terserUnits = collect(terserCode, terserTrace, null)
// `--complement`: the artifact with every function body cut out (top-level glue), and all
// bodies concatenated, per lane — where the whole-artifact difference lives when the bodies
// alone do not explain it.
if (argv.includes("--complement")) {
  const cut = (code, units) => { const sorted = [...units].sort((a, b) => a.start - b.start); let glue = "", i = 0; for (const u of sorted) { if (u.start < i) continue; glue += code.slice(i, u.start) + "0"; i = u.end } return glue + code.slice(i) }
  const files = [["lil.glue.js", cut(lilCode, lilUnits)], ["terser.glue.js", cut(terserCode, terserUnits)], ["lil.bodies.js", lilUnits.map((u) => u.text).join("\n")], ["terser.bodies.js", terserUnits.map((u) => u.text).join("\n")], ["lil.whole.js", lilCode], ["terser.whole.js", terserCode]]
  const paths = files.map(([n, t]) => { const p = join(out, n); writeFileSync(p, t); return p })
  const r = spawnSync(codecPath(), ["--json", ...paths], { encoding: "utf8", maxBuffer: 1 << 27 })
  for (const a of JSON.parse(r.stdout).artifacts) console.log(a.path.split("/").pop().padEnd(18), String(a.raw).padStart(7), String(a.gzip9).padStart(6), String(a.brotli11).padStart(6))
  console.log("units: lil", lilUnits.length, "terser", terserUnits.length)
  process.exit(0)
}

// `--marginal`: each function's cost inside the concatenated bodies of its lane (all bodies
// minus this one), the in-context number the bodies-alone sums cannot give; and the
// top-level statements ranked by the bytes they hold outside any function (the glue).
if (argv.includes("--marginal")) {
  const lane = (label, code, units) => {
    const bodies = units.map((u) => u.text)
    const all = join(out, `${label}.bodies.js`); writeFileSync(all, bodies.join("\n"))
    const files = [all]
    units.forEach((u, i) => { const f = join(out, `${label}.minus.${i}.js`); writeFileSync(f, bodies.filter((_, j) => j !== i).join("\n")); files.push(f) })
    const r = spawnSync(codecPath(), ["--json", ...files], { encoding: "utf8", maxBuffer: 1 << 28 })
    const sizes = JSON.parse(r.stdout).artifacts
    const full = sizes[0].brotli11
    units.forEach((u, i) => { u.marginal = full - sizes[i + 1].brotli11 })
    const ranked = [...units].sort((a, b) => b.marginal - a.marginal)
    console.log(`\n== ${label}: bodies concatenated ${full} Brotli; top functions by in-context cost`)
    for (const u of ranked.slice(0, 25)) console.log(String(u.marginal).padStart(5), String(u.text.length).padStart(6), `${u.module}:${u.name}`.padEnd(46), JSON.stringify(u.text.slice(0, 70)))
    // glue: top-level statements minus their function bodies
    const ast = parse(code, { sourceType: "module", errorRecovery: true })
    const glue = ast.program.body.map((st) => { const inside = units.filter((u) => u.start >= st.start && u.end <= st.end).reduce((a, u) => a + (u.end - u.start), 0); return { bytes: st.end - st.start - inside, start: st.start, text: code.slice(st.start, Math.min(st.end, st.start + 90)) } }).sort((a, b) => b.bytes - a.bytes)
    console.log(`== ${label}: top-level statements by glue bytes (statement bytes outside functions); total glue ${glue.reduce((a, g) => a + g.bytes, 0)}`)
    for (const g of glue.slice(0, 12)) console.log(String(g.bytes).padStart(7), JSON.stringify(g.text))
    return ranked
  }
  lane("lil", lilCode, lilUnits)
  lane("terser", terserCode, terserUnits)
  // Content pairing: the string literals a body contains identify the upstream function far
  // better than either map does. Greedy best-Jaccard match, then rank by in-context delta.
  const lits = (t) => new Set((t.match(/"(?:[^"\\]|\\.){4,}"/g) ?? []).map((x) => x.toLowerCase()))
  const jac = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n) }
  for (const u of lilUnits) u.lits = lits(u.text); for (const u of terserUnits) u.lits = lits(u.text)
  const cands = []
  for (const l of lilUnits) for (const t of terserUnits) { const j = jac(l.lits, t.lits); if (j >= 0.34 && l.lits.size >= 2) cands.push({ l, t, j }) }
  cands.sort((a, b) => b.j - a.j)
  const usedL = new Set(), usedT = new Set(), matched = []
  for (const c of cands) { if (usedL.has(c.l) || usedT.has(c.t)) continue; usedL.add(c.l); usedT.add(c.t); matched.push(c) }
  matched.sort((a, b) => (b.l.marginal - b.t.marginal) - (a.l.marginal - a.t.marginal))
  const sumL = matched.reduce((a, c) => a + c.l.marginal, 0), sumT = matched.reduce((a, c) => a + c.t.marginal, 0)
  console.log(`\n== content-matched pairs: ${matched.length} (of ${lilUnits.length} / ${terserUnits.length}); in-context Brotli lil ${sumL} terser ${sumT}; unmatched lil ${lilUnits.filter((u) => !usedL.has(u)).reduce((a, u) => a + u.marginal, 0)} terser ${terserUnits.filter((u) => !usedT.has(u)).reduce((a, u) => a + u.marginal, 0)}`)
  console.log("delta".padStart(5), "lil".padStart(5), "ter".padStart(5), "lilraw".padStart(6), "terraw".padStart(6), " pair")
  for (const c of matched.slice(0, 28)) console.log(String(c.l.marginal - c.t.marginal).padStart(5), String(c.l.marginal).padStart(5), String(c.t.marginal).padStart(5), String(c.l.text.length).padStart(6), String(c.t.text.length).padStart(6), ` ${c.t.module}:${c.t.name} <- lil ${c.l.module}:${c.l.name} (j=${c.j.toFixed(2)})`)
  console.log("...")
  for (const c of matched.slice(-8)) console.log(String(c.l.marginal - c.t.marginal).padStart(5), String(c.l.marginal).padStart(5), String(c.t.marginal).padStart(5), String(c.l.text.length).padStart(6), String(c.t.text.length).padStart(6), ` ${c.t.module}:${c.t.name} <- lil ${c.l.module}:${c.l.name} (j=${c.j.toFixed(2)})`)
  writeFileSync(join(out, "matched.json"), JSON.stringify(matched.map((c) => ({ delta: c.l.marginal - c.t.marginal, lil: { module: c.l.module, name: c.l.name, marginal: c.l.marginal, raw: c.l.text.length, text: c.l.text }, terser: { module: c.t.module, name: c.t.name, marginal: c.t.marginal, raw: c.t.text.length, text: c.t.text }, j: c.j })), null, 1))
  process.exit(0)
}

// pair by original name (+ module when ambiguous)
// key: module + name, so `functions/accent:mathmlBuilder` never pairs with another module's.
const byKey = (units) => { const m = new Map(); for (const u of units) { const k = `${u.module}:${u.name}`; if (!m.has(k)) m.set(k, []); m.get(k).push(u) } return m }
const L = byKey(lilUnits), T = byKey(terserUnits)
const pairs = [], onlyLil = [], onlyTerser = []
for (const [k, ls] of L) {
  const ts = T.get(k)
  if (!ts) { onlyLil.push(...ls); continue }
  ls.forEach((l, i) => { const t = ts[Math.min(i, ts.length - 1)]; pairs.push({ key: k, module: l.module, lil: l, terser: t }) })
}
for (const [k, ts] of T) if (!L.has(k)) onlyTerser.push(...ts)
const files = []
const safe = (k) => k.replace(/[^\w.$-]/g, "_")
pairs.forEach((p, i) => { p.lilFile = join(out, "lil", `${safe(p.key)}.js`); p.terserFile = join(out, "terser", `${safe(p.key)}.js`); writeFileSync(p.lilFile, p.lil.text); writeFileSync(p.terserFile, p.terser.text); files.push(p.lilFile, p.terserFile) })
onlyLil.forEach((u, i) => { u.file = join(out, "lil", `only_${i}_${safe(u.name)}.js`); writeFileSync(u.file, u.text); files.push(u.file) })
onlyTerser.forEach((u, i) => { u.file = join(out, "terser", `only_${i}_${safe(u.name)}.js`); writeFileSync(u.file, u.text); files.push(u.file) })
const codec = spawnSync(codecPath(), ["--json", ...files], { encoding: "utf8", maxBuffer: 1 << 27 })
if (codec.status !== 0) throw new Error(codec.stderr)
const sizes = new Map(JSON.parse(codec.stdout).artifacts.map((a) => [a.path, a]))
for (const p of pairs) { p.l = sizes.get(p.lilFile); p.t = sizes.get(p.terserFile); p.delta = p.l.brotli11 - p.t.brotli11 }
for (const u of onlyLil) u.size = sizes.get(u.file); for (const u of onlyTerser) u.size = sizes.get(u.file)
pairs.sort((a, b) => b.delta - a.delta)
const json = flag("json", null)
if (json) writeFileSync(resolve(root, json), JSON.stringify({ out, pairs: pairs.map((p) => ({ key: p.key, module: p.module, lil: p.l, terser: p.t, delta: p.delta, lilFile: p.lilFile, terserFile: p.terserFile })), onlyLil: onlyLil.map((u) => ({ name: u.name, module: u.module, size: u.size, file: u.file })), onlyTerser: onlyTerser.map((u) => ({ name: u.name, module: u.module, size: u.size, file: u.file })) }, null, 2))
const pad = (s, n) => String(s ?? "").padStart(n)
console.log(`paired ${pairs.length} units; only in LilScript ${onlyLil.length}; only in Terser ${onlyTerser.length}`)
console.log("unit".padEnd(44), pad("lil raw", 8), pad("ter raw", 8), pad("lil br", 7), pad("ter br", 7), pad("delta", 6))
for (const p of pairs.slice(0, 30)) console.log(`${p.module}:${p.key}`.slice(0, 44).padEnd(44), pad(p.l.raw, 8), pad(p.t.raw, 8), pad(p.l.brotli11, 7), pad(p.t.brotli11, 7), pad(p.delta, 6))
console.log("...")
for (const p of pairs.slice(-10)) console.log(`${p.module}:${p.key}`.slice(0, 44).padEnd(44), pad(p.l.raw, 8), pad(p.t.raw, 8), pad(p.l.brotli11, 7), pad(p.t.brotli11, 7), pad(p.delta, 6))
const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0)
console.log("paired Brotli: lil", sum(pairs, (p) => p.l.brotli11), "terser", sum(pairs, (p) => p.t.brotli11), "| bigger", pairs.filter((p) => p.delta > 0).length, "smaller", pairs.filter((p) => p.delta < 0).length, "| only-lil Brotli", sum(onlyLil, (u) => u.size.brotli11), "only-terser Brotli", sum(onlyTerser, (u) => u.size.brotli11))
// roll-up per module over ALL units of that module in each lane (paired or not): the
// function volume of the module, independent of how each lane chose to inline.
const mods = new Map()
const bump = (module, lane, size) => { const m = mods.get(module) ?? { lil: 0, terser: 0, nl: 0, nt: 0 }; if (lane === "lil") { m.lil += size; m.nl++ } else { m.terser += size; m.nt++ } mods.set(module, m) }
for (const p of pairs) { bump(p.module, "lil", p.l.brotli11); bump(p.module, "terser", p.t.brotli11) }
for (const u of onlyLil) bump(u.module, "lil", u.size.brotli11)
for (const u of onlyTerser) bump(u.module, "terser", u.size.brotli11)
const rolled = [...mods].map(([m, v]) => ({ module: m, ...v, delta: v.lil - v.terser })).sort((a, b) => b.delta - a.delta)
console.log("\nper-module function volume (all units, bodies compressed alone, Brotli):")
console.log("module".padEnd(30), pad("#lil", 5), pad("#ter", 5), pad("lil", 7), pad("terser", 7), pad("delta", 6))
for (const r of rolled) console.log(r.module.padEnd(30), pad(r.nl, 5), pad(r.nt, 5), pad(r.lil, 7), pad(r.terser, 7), pad(r.delta, 6))
if (json) { const j = JSON.parse(readFileSync(resolve(root, json), "utf8")); j.modules = rolled; writeFileSync(resolve(root, json), JSON.stringify(j, null, 2)) }
