// Bottom-up comparison: every upstream module minified alone by Terser (imports left as
// imports) against the same module as one LilScript preserve-modules chunk.
//   node scripts/bottom-up.mjs --lil-dir <dir of preserve-modules chunks> [--json out.json]
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { build } from "esbuild"
import { minify } from "terser"
import { fromSource, terserOptions, codecPath, root } from "./lib/official.mjs"

const argv = process.argv.slice(2)
const flag = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at === -1 ? fallback : argv[at + 1] }
const lilDir = resolve(root, flag("lil-dir", "dist/modules"))
const work = join(tmpdir(), "katexlil-bottom-up")
mkdirSync(work, { recursive: true })

// Terser lane: the Flow-stripped tree from official.mjs, each module transformed alone.
const source = await fromSource({ work: join(work, "source") })
const stripped = join(source.work, "src-root")
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : [] })
const terserDir = join(work, "terser")
mkdirSync(terserDir, { recursive: true })
const rows = new Map()
for (const file of walk(stripped)) {
  const rel = relative(stripped, file).replace(/\.js$/, "")
  const es = await build({ entryPoints: [file], bundle: false, format: "esm", platform: "neutral", legalComments: "none", write: false, outfile: "m.js" })
  const code = es.outputFiles[0].text
  const min = await minify({ "m.js": code }, terserOptions)
  const out = join(terserDir, rel.replace(/\//g, "__") + ".js")
  writeFileSync(out, min.code)
  rows.set(rel, { terser: out })
}
// LilScript lane: one chunk per source module.
const chunkName = (name) => name.replace(/\.js$/, "").replace(/\.lil$/, "")
if (existsSync(lilDir)) for (const file of walk(lilDir)) {
  const rel = relative(lilDir, file)
  const key = chunkName(rel).replace(/^src\//, "").replace(/^entry$/, "katex")
  const row = rows.get(key) ?? {}
  row.lil = file
  rows.set(key, row)
}
const files = []
for (const [key, row] of rows) { if (row.terser) files.push(row.terser); if (row.lil) files.push(row.lil) }
const codec = spawnSync(codecPath(), ["--json", ...files], { encoding: "utf8", maxBuffer: 1 << 26 })
if (codec.status !== 0) throw new Error(codec.stderr)
const sizes = new Map(JSON.parse(codec.stdout).artifacts.map((a) => [a.path, a]))
const table = [...rows].map(([key, row]) => ({ module: key, lil: row.lil ? sizes.get(row.lil) : null, terser: row.terser ? sizes.get(row.terser) : null, lilPath: row.lil, terserPath: row.terser }))
  .map((r) => ({ ...r, delta: r.lil && r.terser ? r.lil.brotli11 - r.terser.brotli11 : null }))
  .sort((a, b) => (b.delta ?? -1e9) - (a.delta ?? -1e9))
const json = flag("json", null)
if (json) writeFileSync(resolve(root, json), JSON.stringify({ work, table }, null, 2))
const pad = (s, n) => String(s ?? "").padStart(n)
console.log("module".padEnd(34), pad("lil raw", 8), pad("terser", 8), pad("lil br", 7), pad("ter br", 7), pad("delta", 6))
let sl = 0, st = 0
for (const r of table) { if (r.lil && r.terser) { sl += r.lil.brotli11; st += r.terser.brotli11 }; console.log(r.module.padEnd(34), pad(r.lil?.raw, 8), pad(r.terser?.raw, 8), pad(r.lil?.brotli11, 7), pad(r.terser?.brotli11, 7), pad(r.delta, 6)) }
console.log("paired totals: lil", sl, "terser", st, "| bigger", table.filter((r) => r.delta > 0).length, "smaller", table.filter((r) => r.delta < 0).length)
