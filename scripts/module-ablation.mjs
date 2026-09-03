// Per module, the Brotli each lane pays for that module's functions: remove them
// from the artifact and re-measure. Content-aligned, because both lanes contain
// the same functions.
//   node scripts/module-ablation.mjs --terser <artifact-with-map> --out <dir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { resolve, join } from "node:path"
import { parse } from "@babel/parser"
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping"
import { root } from "./lib/official.mjs"

const argv = process.argv.slice(2)
const flag = (n, d) => { const at = argv.indexOf(`--${n}`); return at === -1 ? d : argv[at + 1] }
const lilPath = resolve(root, flag("lil", "dist/katex.raw.js"))
const terserPath = resolve(flag("terser", ""))
const out = resolve(flag("out", "/tmp/module-ablation"))
mkdirSync(out, { recursive: true })

const moduleOf = (s) => { if (!s) return "?"; let x = s.replace(/\\/g, "/"); const at = x.lastIndexOf("/src/"); x = at !== -1 ? x.slice(at + 5) : x.split("/").pop(); return x.replace(/\.(lil|js)$/, "") }
const FN = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ObjectMethod", "ClassMethod", "ClassPrivateMethod"])

function units(code, trace) {
  const ast = parse(code, { sourceType: "module", errorRecovery: true })
  const found = []
  const walk = (node) => {
    if (!node || typeof node !== "object") return
    if (Array.isArray(node)) { for (const c of node) walk(c); return }
    if (!node.type) return
    if (FN.has(node.type)) {
      const pos = originalPositionFor(trace, { line: node.loc.start.line, column: node.loc.start.column })
      found.push({ module: moduleOf(pos.source), start: node.start, end: node.end })
      return
    }
    for (const k of Object.keys(node)) if (k !== "loc" && k !== "extra") walk(node[k])
  }
  walk(ast.program.body)
  return found
}

function write(tag, code, list) {
  const byModule = new Map()
  for (const u of list) { if (!byModule.has(u.module)) byModule.set(u.module, []); byModule.get(u.module).push(u) }
  const index = []
  let n = 0
  for (const [name, group] of byModule) {
    const bytes = group.reduce((s, u) => s + u.end - u.start, 0)
    if (bytes < 500) continue
    const sorted = [...group].sort((a, b) => a.start - b.start)
    let text = "", prev = 0
    for (const u of sorted) { if (u.start < prev) continue; text += code.slice(prev, u.start) + "0"; prev = u.end }
    text += code.slice(prev)
    const id = `${tag}.${String(n++).padStart(3, "0")}`
    writeFileSync(join(out, `${id}.js`), text)
    index.push({ id, name, bytes, count: group.length })
  }
  writeFileSync(join(out, `${tag}.index.json`), JSON.stringify(index))
  console.error(`${tag}: ${byModule.size} modules, ${n} written`)
}

const lilCode = readFileSync(lilPath, "utf8")
write("ours", lilCode, units(lilCode, new TraceMap(JSON.parse(readFileSync(lilPath + ".map", "utf8")))))
const terserCode = readFileSync(terserPath, "utf8")
write("them", terserCode, units(terserCode, new TraceMap(JSON.parse(readFileSync(terserPath + ".map", "utf8")))))
writeFileSync(join(out, "ours.base.js"), lilCode)
writeFileSync(join(out, "them.base.js"), terserCode)
