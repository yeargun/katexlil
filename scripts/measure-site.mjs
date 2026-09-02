// Writes site/results.json — every number the Pages site shows — from the artifacts in dist/
// and the official package, so a reader can regenerate the page's claims:
//
//   node scripts/measure-site.mjs [--spec] [--rounds 30] [--no-browser] [--attribution <json>]
//
// Sizes: lilscript-codec (zlib 1.3.1 gzip-9, Google Brotli 1.1.0 q11 / w22) on the shipped ESM,
// the closed build, and the official lanes from scripts/lib/official.mjs. Throughput: the shared
// corpus (site/corpus.js) in this Node, and in headless Chromium through Playwright
// (scripts/lib/browser-bench.mjs, the same page as site/bench.html). `--spec` re-runs the
// official Jest suites and counts them; otherwise the previous count is kept.
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { performance } from "node:perf_hooks"
import { published, fromSource, pin, codecPath, root } from "./lib/official.mjs"
import { benchmark, summarize, parity, corpus } from "../site/corpus.js"

const argv = process.argv.slice(2)
const flag = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at === -1 ? fallback : argv[at + 1] }
const has = (name) => argv.includes(`--${name}`)
const rounds = Number(flag("rounds", 30))
const site = resolve(root, "site")
const resultsPath = join(site, "results.json")
const previous = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, "utf8")) : {}
const work = join(tmpdir(), "katexlil-measure")
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })

// ---- sizes ----
const official = await published()
const source = await fromSource({ work: join(work, "source") })
const lanes = [
  { id: "official", name: `Official katex@${pin} graph`, file: "official.bundle.js", text: official.bundle, note: "esbuild bundle of the published package plus runtime deps, unminified" },
  { id: "official-terser-mangle", name: "Official · Terser mangle on", file: "official.terser.js", text: official.terserMangle, note: "Terser compress (3 passes) of that graph, mangle: true", baseline: true },
  { id: "official-terser-nomangle", name: "Official · Terser mangle off", file: "official.terser-nomangle.js", text: official.terserNoMangle, note: "Terser compress of that graph, mangle: false" },
  { id: "official-esbuild", name: "Official · esbuild minify", file: "official.esbuild.js", text: official.esbuildMinify, note: "esbuild minify of that graph" },
  { id: "official-source-terser", name: "Official source · esbuild + Terser", file: "official.source-terser.js", text: source.code, note: `katex@${pin} Flow sources type-stripped, esbuild bundle, Terser mangle on: the strongest JavaScript lane on the same source boundary`, strongest: true },
  { id: "itslil", name: "@itslil/katex · open world", path: "dist/katex.esm.js", note: "The npm ESM: direct LilScript js-module output, extern_fields = true, public API and option names kept", primary: true, world: "open" },
  { id: "itslil-closed", name: "@itslil/katex · closed world", path: "dist/katex.closed.js", note: "Same source, extern_fields = false: JavaScript-facing option and node fields may mangle", world: "closed" },
]
for (const lane of lanes) {
  if (lane.text != null) { lane.path = join(work, lane.file); writeFileSync(lane.path, lane.text) } else lane.path = resolve(root, lane.path)
}
const codec = spawnSync(codecPath(), ["--json", ...lanes.map((l) => l.path)], { encoding: "utf8", maxBuffer: 1 << 26 })
if (codec.status !== 0) throw new Error(`lilscript-codec: ${codec.stderr}`)
const measured = JSON.parse(codec.stdout)
const size = lanes.map((lane, i) => {
  const { raw, gzip9, brotli11 } = measured.artifacts[i]
  const { text, path, file, ...rest } = lane
  return { ...rest, raw, gzip9, brotli11 }
})
const codecLabel = `lilscript-codec: zlib ${measured.codecs.gzip9.libraryVersion} gzip-${measured.codecs.gzip9.level} / Google Brotli ${measured.codecs.brotli11.libraryVersion} q${measured.codecs.brotli11.quality} w${measured.codecs.brotli11.lgwin}`
// The official lane the playground and benchmark load: the Terser-minified published graph.
writeFileSync(join(site, "official.js"), official.terserMangle)

// ---- throughput in Node ----
const lilMod = await import(resolve(root, "dist/katex.esm.js"))
const officialMod = await import(resolve(root, "node_modules/katex/dist/katex.mjs"))
const nodeLanes = [
  { id: "itslil", name: "@itslil/katex", renderToString: lilMod.renderToString },
  { id: "official", name: `katex@${pin}`, renderToString: officialMod.default.renderToString },
]
const nodeParity = parity(nodeLanes)
const nodeTimes = benchmark(nodeLanes, { rounds, warmup: 5, now: () => performance.now() })
const nodeSummary = nodeLanes.map((lane) => ({ id: lane.id, name: lane.name, ...summarize(nodeTimes[lane.id]) }))

// ---- throughput in Chromium ----
let browser = previous.browser ?? null
if (!has("no-browser")) {
  const { runBrowserBench } = await import("./lib/browser-bench.mjs")
  const siteDir = resolve(root, "_site")
  const built = spawnSync(process.execPath, [resolve(root, "scripts/build-site.mjs")], { cwd: root, stdio: "inherit" })
  if (built.status !== 0) throw new Error("build-site failed")
  if (!existsSync(join(siteDir, "official.js"))) throw new Error("_site/official.js missing")
  browser = await runBrowserBench({ siteDir, rounds })
}

// ---- spec ----
let spec = previous.spec ?? null
if (has("spec")) {
  const jest = spawnSync(process.execPath, ["--experimental-vm-modules", "./node_modules/jest/bin/jest.js", "--config", "test/official/jest.config.mjs", "--runInBand", "--json"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 })
  const report = JSON.parse(jest.stdout.slice(jest.stdout.indexOf("{")))
  spec = { total: report.numTotalTests, pass: report.numPassedTests, label: "official Jest suites (core, screenshotter data, contrib)" }
}

const attributionPath = flag("attribution", null)
const attribution = attributionPath ? JSON.parse(readFileSync(resolve(root, attributionPath), "utf8")) : previous.attribution ?? null

const results = {
  pin: `katex@${pin}`,
  package: "@itslil/katex",
  file: "katex",
  lilExport: "renderToString",
  officialExport: "default",
  measuredAt: new Date().toISOString(),
  node: process.version,
  codec: codecLabel,
  runtime: `Node ${process.version}`,
  warmupDiscard: 5,
  corpus: corpus.length,
  rounds,
  comparison: `Official rows are an esbuild bundle of katex@${pin} plus its runtime graph, then Terser or esbuild; the source lane is the Flow sources through esbuild and Terser. LilScript rows are the compiler's output, never post-minified. Open world keeps the public API and option names; closed world sets extern_fields = false.`,
  spec,
  play: previous.play ?? { kind: "tex-html", sample: corpus[0], samples: [{ label: "frac", value: corpus[0] }, { label: "scripts", value: corpus[1] }] },
  size,
  throughput: nodeSummary.map((row) => ({ id: row.id, name: row.name, documentMs: row.median, p10: row.p10, p90: row.p90, rounds: row.rounds })),
  nodeParity: { compared: nodeParity.compared, mismatches: nodeParity.mismatches.length },
  browser,
  attribution,
  sources: {
    measure: "scripts/measure-site.mjs",
    corpus: "site/corpus.js",
    benchPage: "bench.html",
    browserTest: "test/browser-perf.test.mjs",
    attribution: "scripts/attribute-map.mjs",
    official: "scripts/lib/official.mjs",
  },
}
writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`)
const baseline = size.find((l) => l.baseline)
const strongest = size.find((l) => l.strongest)
const open = size.find((l) => l.id === "itslil")
const closed = size.find((l) => l.id === "itslil-closed")
console.log(`Brotli-11: open ${open.brotli11}  closed ${closed.brotli11}  Terser(published) ${baseline.brotli11}  Terser(source) ${strongest.brotli11}`)
console.log(`Node: ${nodeSummary.map((r) => `${r.name} ${r.median.toFixed(2)} ms`).join("  ")}  parity ${nodeParity.compared - nodeParity.mismatches.length}/${nodeParity.compared}`)
if (browser) console.log(`${browser.browser}: ${Object.values(browser.lanes).map((r) => `${r.name} ${r.median.toFixed(2)} ms`).join("  ")}  ratio ${browser.ratio.toFixed(3)}`)
