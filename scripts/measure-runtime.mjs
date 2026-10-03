import { execFileSync } from "node:child_process"
import { cpus, platform, release, arch, totalmem } from "node:os"
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { defaults } from "../site/runtime-benchmark.js"
import { validateSettings } from "../site/corpus.js"
import { prepareBenchmarkSite, runtimeIds, verifyPerformance } from "./lib/runtime-bench.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const { values } = parseArgs({ options: Object.fromEntries(["runtimes", "rounds", "warmup", "batch", "output"].map(name => [name, { type: "string" }])) })
const selected = values.runtimes ? values.runtimes.split(",") : runtimeIds
if (!selected.length || new Set(selected).size !== selected.length || selected.some(id => !runtimeIds.includes(id))) throw new Error(`runtimes must be unique names from ${runtimeIds.join(",")}`)
const runtimes = runtimeIds.filter(id => selected.includes(id))
const settings = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, Number(values[key] ?? fallback)]))
validateSettings(settings)
const complete = runtimes.length === runtimeIds.length
const output = resolve(root, values.output ?? (complete ? "site/performance.json" : `.tmp/performance-${runtimes.join("-")}.json`))
if (!complete && output === join(root, "site/performance.json")) throw new Error("Only a complete four-runtime run can replace the published receipt")
await mkdir(join(root, ".tmp"), { recursive: true })
const siteDir = await mkdtemp(join(root, ".tmp/runtime-bench-"))
try {
  const manifest = await prepareBenchmarkSite(root, siteDir)
  const data = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    scope: "Warm renderToString throughput; excludes imports, network, DOM insertion, layout and paint. Browser engines run headlessly through Playwright. Each comparison uses a fresh process/browser, sequentially on one machine.",
    unit: "milliseconds per 30-expression corpus (batch time divided by batch count)",
    settings,
    machine: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryGiB: +(totalmem() / 2 ** 30).toFixed(1), os: `${platform()} ${release()} ${arch()}` },
    manifest,
    runtimes: [],
  }
  for (const id of runtimes) {
    const runtime = { id, name: { node: "Node.js", chromium: "Chromium", firefox: "Firefox", webkit: "WebKit" }[id], cases: [] }
    for (const comparison of manifest.cases) {
      let result
      if (id === "node") {
        result = JSON.parse(execFileSync(process.execPath, [join(root, "scripts/bench-node.mjs"), siteDir, comparison.id, JSON.stringify(settings)], { encoding: "utf8", timeout: 180000 }))
        runtime.version = process.version
        runtime.v8 = process.versions.v8
      } else {
        const { runBrowserBench } = await import("./lib/browser-bench.mjs")
        result = await runBrowserBench({ siteDir, browserName: id, caseId: comparison.id, ...settings })
        runtime.version = result.version
        runtime.playwright = result.playwright
      }
      runtime.cases.push(result)
      console.log(`${runtime.name} · ${comparison.name}: original ${result.lanes.official.median.toFixed(3)} ms; LilScript ${result.lanes.itslil.median.toFixed(3)} ms; ${result.ratio.toFixed(3)}× time; parity ${result.parity.compared}/${result.corpus}`)
    }
    data.runtimes.push(runtime)
  }
  if (complete) verifyPerformance(root, data)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(`${output}.tmp`, JSON.stringify(data, null, 2) + "\n")
  await rename(`${output}.tmp`, output)
  console.log(`Saved ${output}`)
} finally {
  await rm(siteDir, { recursive: true, force: true })
}
