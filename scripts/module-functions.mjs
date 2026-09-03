// Bottom-up per module: every function in one module, both lanes, paired by name and sized.
//   node scripts/module-functions.mjs --module delimiter [--lil dist/katex.raw.js] [--terser <artifact>] [--print <name>]
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parse } from "@babel/parser"
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping"
import { root } from "./lib/official.mjs"

const argv = process.argv.slice(2)
const flag = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at === -1 ? fallback : argv[at + 1] }
const lilPath = resolve(root, flag("lil", "dist/katex.raw.js"))
const terserPath = resolve(flag("terser", ""))
const want = flag("module", "delimiter")
const printName = flag("print", null)

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

const lilCode = readFileSync(lilPath, "utf8")
const lilMap = JSON.parse(readFileSync(lilPath + ".map", "utf8"))
const gen2orig = new Map()
for (const r of lilMap.x_lilscript?.mangledNames ?? []) if (r.kind === "global" && !gen2orig.has(r.generated)) gen2orig.set(r.generated, stripM(r.original))
const ours = collect(lilCode, new TraceMap(lilMap), (g) => gen2orig.get(g)).filter((u) => u.module === want)
const theirs = terserPath ? collect(readFileSync(terserPath, "utf8"), new TraceMap(JSON.parse(readFileSync(terserPath + ".map", "utf8"))), null).filter((u) => u.module === want) : []

if (printName) {
  for (const [tag, list] of [["OURS", ours], ["THEIRS", theirs]]) for (const u of list) if (u.name === printName) console.log(`===== ${tag} ${u.name} (${u.text.length} bytes)\n${u.text}\n`)
  process.exit(0)
}
const byName = new Map()
for (const u of ours) byName.set(u.name, { name: u.name, ours: (byName.get(u.name)?.ours ?? 0) + u.text.length })
for (const u of theirs) byName.set(u.name, { ...(byName.get(u.name) ?? { name: u.name, ours: 0 }), theirs: (byName.get(u.name)?.theirs ?? 0) + u.text.length })
const rows = [...byName.values()].map((r) => ({ ...r, theirs: r.theirs ?? 0, delta: r.ours - (r.theirs ?? 0) })).sort((a, b) => b.delta - a.delta)
console.log(`module ${want}: ours ${ours.length} functions ${ours.reduce((n, u) => n + u.text.length, 0)} bytes | theirs ${theirs.length} functions ${theirs.reduce((n, u) => n + u.text.length, 0)} bytes`)
console.log("name".padEnd(28), "ours".padStart(7), "theirs".padStart(7), "delta".padStart(7))
for (const r of rows) console.log(r.name.padEnd(28), String(r.ours).padStart(7), String(r.theirs).padStart(7), String(r.delta).padStart(7))
