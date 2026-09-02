// Dump the generated code each module owns, from an artifact and its source map:
//   node scripts/dump-modules.mjs <label> <artifact.js> <artifact.js.map> <out-dir>
// Companion to attribute-map.mjs: read the two lanes' spellings of one module side by side.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { parse } from "@babel/parser"
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping"
const [lane, codePath, mapPath, outDir] = process.argv.slice(2)
const code = readFileSync(codePath, "utf8")
const trace = new TraceMap(JSON.parse(readFileSync(mapPath, "utf8")))
const ast = parse(code, { sourceType: "module", tokens: true, errorRecovery: true })
const moduleOf = (s) => { if (!s) return null; let x = s.replace(/\\/g, "/"); const at = x.lastIndexOf("/src/"); x = at !== -1 ? x.slice(at + 1) : x.split("/").pop(); return x.replace(/\.(lil|js|mjs)$/, "") }
const out = new Map(); let last = "(unmapped)"; let prevIdx = new Map()
ast.tokens.forEach((t, i) => {
  if (t.type?.label === "eof") return
  const pos = originalPositionFor(trace, { line: t.loc.start.line, column: t.loc.start.column })
  const m = pos.source ? moduleOf(pos.source) : last; if (pos.source) last = m
  const prev = prevIdx.get(m)
  let s = out.get(m) ?? ""
  if (prev !== undefined) s += prev === i - 1 ? code.slice(ast.tokens[prev].end, t.start) : "\n"
  s += code.slice(t.start, t.end); out.set(m, s); prevIdx.set(m, i)
})
mkdirSync(outDir, { recursive: true })
for (const [m, s] of out) writeFileSync(`${outDir}/${m.replace(/\//g, "__")}.js`, s)
console.log(lane, out.size, "modules")
