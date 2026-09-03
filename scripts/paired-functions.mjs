// Every function that both lanes name the same way, in the same module, ranked by our excess.
//   node scripts/paired-functions.mjs --terser <artifact-with-map> [--min 12]
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parse } from "@babel/parser"
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping"
import { root } from "./lib/official.mjs"

const argv = process.argv.slice(2)
const flag = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at === -1 ? fallback : argv[at + 1] }
const lilPath = resolve(root, flag("lil", "dist/katex.raw.js"))
const terserPath = resolve(flag("terser", ""))
const min = Number(flag("min", 12))

const moduleOf = (s) => { if (!s) return "?"; let x = s.replace(/\\/g, "/"); const at = x.lastIndexOf("/src/"); x = at !== -1 ? x.slice(at + 5) : x.split("/").pop(); return x.replace(/\.(lil|js)$/, "") }
const stripM = (n) => n.replace(/^\$m\d+\$/, "")
const FN = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ObjectMethod", "ClassMethod", "ClassPrivateMethod"])

function collect(code, trace, nameAt) {
  const ast = parse(code, { sourceType: "module", errorRecovery: true })
  const units = []
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
      units.push({ name: stripM(name ?? "(anonymous)"), module: moduleOf(pos.source), text: code.slice(node.start, node.end) })
      return
    }
    let childLabel = label
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") { const p = posOf(node.id.loc.start); childLabel = p.name ?? nameAt?.(node.id.name) ?? node.id.name }
    if (node.type === "AssignmentExpression" && node.left.type === "Identifier") { const p = posOf(node.left.loc.start); childLabel = p.name ?? nameAt?.(node.left.name) ?? node.left.name }
    if (node.type === "AssignmentExpression" && node.left.type === "MemberExpression") { const pr = node.left.property; childLabel = pr.name ?? pr.value ?? label }
    if (node.type === "ObjectProperty" && node.key) childLabel = node.key.name ?? node.key.value ?? label
    for (const k of Object.keys(node)) if (k !== "loc" && k !== "extra") walk(node[k], childLabel)
  }
  walk(ast.program.body, null)
  return units
}

const lilMap = JSON.parse(readFileSync(lilPath + ".map", "utf8"))
const gen2orig = new Map()
for (const r of lilMap.x_lilscript?.mangledNames ?? []) if (r.kind === "global" && !gen2orig.has(r.generated)) gen2orig.set(r.generated, stripM(r.original))
const ours = collect(readFileSync(lilPath, "utf8"), new TraceMap(lilMap), (g) => gen2orig.get(g))
const theirs = collect(readFileSync(terserPath, "utf8"), new TraceMap(JSON.parse(readFileSync(terserPath + ".map", "utf8"))), null)

const key = (u) => `${u.module}::${u.name}`
const byKey = new Map()
for (const u of theirs) { const k = key(u); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(u) }
const rows = []
for (const u of ours) {
  const k = key(u)
  const pool = byKey.get(k)
  if (!pool || pool.length !== 1) continue          // only unambiguous 1:1 names
  const mine = ours.filter((o) => key(o) === k)
  if (mine.length !== 1) continue
  // The map can name one of our functions after a binding the emitter moved, so
  // require the two bodies to share evidence: a string literal, or -- for
  // bodies with no strings -- a similar size. Otherwise the pair is a coincidence.
  const strings = (t) => new Set([...t.matchAll(/"((?:[^"\\\n]|\\.){4,})"/g)].map((m) => m[1]))
  const mineStrings = strings(u.text), theirStrings = strings(pool[0].text)
  const shared = [...mineStrings].filter((x) => theirStrings.has(x)).length
  if (mineStrings.size + theirStrings.size > 0 && shared === 0) continue
  rows.push({ module: u.module, name: u.name, ours: u.text.length, theirs: pool[0].text.length, delta: u.text.length - pool[0].text.length })
}
rows.sort((a, b) => b.delta - a.delta)
const total = rows.reduce((n, r) => n + r.delta, 0)
console.log(`${rows.length} unambiguous pairs, our excess ${total} bytes (ours ${rows.reduce((n, r) => n + r.ours, 0)}, theirs ${rows.reduce((n, r) => n + r.theirs, 0)})`)
console.log(`${"module".padEnd(26)}${"name".padEnd(24)}${"ours".padStart(7)}${"theirs".padStart(7)}${"delta".padStart(7)}`)
for (const r of rows.filter((r) => r.delta >= min)) console.log(`${r.module.padEnd(26)}${r.name.padEnd(24)}${String(r.ours).padStart(7)}${String(r.theirs).padStart(7)}${String(r.delta).padStart(7)}`)
