import { readFileSync, readdirSync, statSync } from "node:fs"
import { resolve, relative } from "node:path"
import { brotliCompressSync, constants as zlibConstants } from "node:zlib"
import { parse } from "@babel/parser"
import { build } from "esbuild"
import { minify } from "terser"
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping"

const root = resolve(import.meta.dirname, "..")
const upstream = resolve(root, "node_modules/katex")
const sourceRoot = resolve(upstream, "src")
const localPath = resolve(root, "dist/katex.raw.js")

function walk(path) {
  return readdirSync(path).flatMap((name) => {
    const child = resolve(path, name)
    return statSync(child).isDirectory() ? walk(child) : [child]
  })
}

function sourceModules() {
  const modules = new Map()
  const files = [resolve(upstream, "katex.js"), ...walk(sourceRoot).filter((path) => path.endsWith(".js"))]
  for (const path of files) {
    const module = path === resolve(upstream, "katex.js") ? "katex.js" : `src/${relative(sourceRoot, path)}`
    const source = readFileSync(path, "utf8")
    const ast = parse(source, { sourceType: "module", plugins: ["flow"] })
    const names = new Set()
    const strings = new Set()
    walkNode(ast.program, (node) => {
      for (const name of namesFor(node)) names.add(name)
      if (node.type === "StringLiteral" && node.value) strings.add(node.value)
    })
    modules.set(module, { names, strings })
  }
  modules.get("src/fontMetricsData.js").names.add("fontMetricsData")
  modules.get("src/unicodeSymbols.js").names.add("unicodeSymbols")
  return modules
}

function walkNode(node, visit) {
  if (!node || typeof node !== "object") return
  visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "extra" || key === "tokens" || key === "comments") continue
    if (Array.isArray(value)) {
      for (const child of value) walkNode(child, visit)
    } else if (value?.type) {
      walkNode(value, visit)
    }
  }
}

const modules = sourceModules()
const nameOwners = new Map()
const stringOwners = new Map()
for (const [module, facts] of modules) {
  for (const name of facts.names) {
    const entries = nameOwners.get(name) ?? []
    entries.push(module)
    nameOwners.set(name, entries)
  }
  for (const string of facts.strings) {
    const entries = stringOwners.get(string) ?? []
    entries.push(module)
    stringOwners.set(string, entries)
  }
}
const normalizeName = (name) => name.replace(/\$\d+$/, "").replace(/^[A-Za-z][\w$]*_/, "")

function namesFor(node) {
  if (node.type === "VariableDeclarator" && node.id.type === "Identifier") return [node.id.name]
  if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id) return [node.id.name]
  return []
}

function ownerFor(node, previous) {
  const names = namesFor(node)
  for (const rawName of names) {
    for (const name of [rawName, normalizeName(rawName)]) {
      const candidates = nameOwners.get(name)
      if (candidates?.length === 1) return candidates[0]
      if (previous && candidates?.includes(previous)) return previous
    }
  }
  const score = new Map()
  walkNode(node, (child) => {
    if (child.type !== "StringLiteral" || !child.value) return
    const candidates = stringOwners.get(child.value) ?? []
    const weight = 1 / candidates.length
    for (const module of candidates) score.set(module, (score.get(module) ?? 0) + weight)
  })
  const ranked = [...score].sort((a, b) => b[1] - a[1])
  if (ranked[0]?.[1] > (ranked[1]?.[1] ?? 0)) return ranked[0][0]
  return previous ?? "unattributed"
}

function operation(node, counts) {
  const type = node.type
  if (type === "CallExpression" || type === "OptionalCallExpression") counts.call++
  else if (type === "NewExpression") counts.construct++
  else if (type === "MemberExpression" || type === "OptionalMemberExpression") counts.member++
  else if (type === "BinaryExpression" || type === "LogicalExpression") counts.binary++
  else if (type === "AssignmentExpression" || type === "UpdateExpression") counts.write++
  else if (type === "IfStatement" || type === "ConditionalExpression" || type === "SwitchCase") counts.branch++
  else if (type === "ForStatement" || type === "ForInStatement" || type === "ForOfStatement" || type === "WhileStatement" || type === "DoWhileStatement") counts.loop++
  else if (type === "ObjectExpression" || type === "ArrayExpression") counts.literal++
}

function row(map, module) {
  if (!map.has(module)) {
    map.set(module, { module, bytes: 0, tokens: 0, call: 0, construct: 0, member: 0, binary: 0, write: 0, branch: 0, loop: 0, literal: 0 })
  }
  return map.get(module)
}

function lineOwners(code) {
  const ast = parse(code, { sourceType: "module" })
  const lines = []
  let previous = "unattributed"
  for (const statement of ast.program.body) {
    const declaration = statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
      ? statement.declaration
      : statement
    previous = ownerFor(declaration ?? statement, previous)
    for (let line = statement.loc.start.line; line <= statement.loc.end.line; line++) lines[line] = previous
  }
  return lines
}

function countMapped(code, sourceMap, modulesByLine) {
  const totals = new Map()
  const ast = parse(code, { sourceType: "module", tokens: true })
  const trace = new TraceMap(sourceMap)
  for (const token of ast.tokens) {
    const original = originalPositionFor(trace, token.loc.start)
    const module = modulesByLine[original.line] ?? "unattributed"
    const target = row(totals, module)
    target.tokens++
    target.bytes += Buffer.byteLength(code.slice(token.start, token.end))
  }
  walkNode(ast.program, (node) => {
    if (!node.loc) return
    const original = originalPositionFor(trace, node.loc.start)
    const target = row(totals, modulesByLine[original.line] ?? "unattributed")
    operation(node, target)
  })
  return totals
}

function countLocal(code) {
  const totals = new Map()
  const ast = parse(code, { sourceType: "module", tokens: true })
  let previous = "unattributed"
  for (const statement of ast.program.body) {
    const declaration = statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
      ? statement.declaration
      : statement
    const parts = declaration?.type === "VariableDeclaration" ? declaration.declarations : [declaration ?? statement]
    for (const part of parts) {
      const module = ownerFor(part, previous)
      if (module !== "unattributed") previous = module
      const target = row(totals, module)
      const start = part.start ?? statement.start
      const end = part.end ?? statement.end
      const tokens = ast.tokens.filter((token) => token.start >= start && token.end <= end)
      target.tokens += tokens.length
      target.bytes += Buffer.byteLength(code.slice(start, end))
      walkNode(part, (node) => operation(node, target))
    }
  }
  return totals
}

function summarize(totals) {
  return [...totals.values()]
    .map((item) => ({ ...item, operations: item.call + item.construct + item.member + item.binary + item.write + item.branch + item.loop + item.literal }))
    .sort((a, b) => b.operations - a.operations || b.bytes - a.bytes)
}

function table(totals) {
  const modules = summarize(totals)
  const top = process.argv.includes("--all") ? modules : modules.slice(0, 25)
  return {
    attributedBytes: modules.reduce((sum, item) => sum + item.bytes, 0),
    tokens: modules.reduce((sum, item) => sum + item.tokens, 0),
    operations: modules.reduce((sum, item) => sum + item.operations, 0),
    modules: top,
  }
}

const bundle = await build({
  entryPoints: [resolve(upstream, "dist/katex.mjs")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  legalComments: "none",
  sourcemap: "external",
  write: false,
  outfile: "official.js",
})
const bundledCode = bundle.outputFiles.find((file) => file.path.endsWith(".js")).text
const bundledMap = bundle.outputFiles.find((file) => file.path.endsWith(".js.map")).text
const terser = await minify({ "official.js": bundledCode }, {
  module: true,
  compress: { passes: 3 },
  mangle: true,
  sourceMap: { content: bundledMap, asObject: true },
})
const officialCode = terser.code
const officialRows = summarize(countMapped(
  officialCode,
  terser.map,
  lineOwners(readFileSync(resolve(upstream, "dist/katex.mjs"), "utf8")),
))

const report = {
  terser: "5.44.0",
  options: { module: true, compress: { passes: 3 }, mangle: true },
  official: {
    raw: Buffer.byteLength(officialCode),
    brotli11: brotliCompressSync(officialCode, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }).length,
    attributedBytes: officialRows.reduce((sum, item) => sum + item.bytes, 0),
    tokens: officialRows.reduce((sum, item) => sum + item.tokens, 0),
    operations: officialRows.reduce((sum, item) => sum + item.operations, 0),
    modules: process.argv.includes("--all") ? officialRows : officialRows.slice(0, 25),
  },
}

try {
  report.local = table(countLocal(readFileSync(localPath, "utf8")))
} catch (error) {
  if (error.code !== "ENOENT") throw error
}

console.log(JSON.stringify(report, null, 2))
