import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { cp, mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { verifyComparison } from "../build-comparison.mjs"
import { summarize, corpus } from "../../site/corpus.js"

const hash = bytes => createHash("sha256").update(bytes).digest("hex")
export const runtimeIds = ["node", "chromium", "firefox", "webkit"]

export function benchmarkManifest(root) {
  const comparison = verifyComparison(root)
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const artifact = (source, url, name) => ({ source, url, name, sha256: hash(readFileSync(join(root, source))) })
  const original = row => artifact(`site/${row.artifact.replace(/^\.\//, "")}`, row.artifact, `KaTeX ${comparison.upstream.version} · ${row.tool}`)
  const terser = comparison.minifiers.find(row => row.tool === "Terser")
  const cases = [
    { id: "shipped", name: "Shipped package ESM", itslil: artifact("dist/katex.mjs", "./runtime-artifacts/katex.mjs", `${pkg.name} ${pkg.version}`), official: original(terser) },
    ...comparison.objectives.map(row => ({
      id: row.objective,
      name: `${{ raw: "Raw", gzip: "gzip", brotli: "Brotli" }[row.objective]} objective`,
      itslil: artifact(`site/${row.lilscript.artifact.replace(/^\.\//, "")}`, row.lilscript.artifact, `LilScript · ${row.objective}`),
      official: original(row.original),
    })),
  ]
  const harness = Object.fromEntries(["site/corpus.js", "site/runtime-benchmark.js", "site/bench.js", "scripts/lib/browser-bench.mjs", "scripts/lib/runtime-bench.mjs", "scripts/bench-node.mjs", "scripts/measure-runtime.mjs"].map(path => [path, hash(readFileSync(join(root, path)))]))
  return { schemaVersion: 1, cases, harness }
}

// Browser bytes match Node bytes. No compiler or minifier is needed to benchmark.
export async function prepareBenchmarkSite(root, output) {
  const manifest = benchmarkManifest(root)
  await mkdir(output, { recursive: true })
  for (const file of ["bench.html", "bench.js", "corpus.js", "runtime-benchmark.js", "styles.css"]) await cp(join(root, "site", file), join(output, file))
  for (const comparison of manifest.cases) for (const lane of [comparison.official, comparison.itslil]) {
    const destination = join(output, lane.url)
    await mkdir(dirname(destination), { recursive: true })
    await cp(join(root, lane.source), destination)
  }
  await writeFile(join(output, "runtime-manifest.json"), JSON.stringify(manifest, null, 2) + "\n")
  return manifest
}

export function verifyPerformance(root, data = JSON.parse(readFileSync(join(root, "site/performance.json"), "utf8"))) {
  assert.equal(data.schemaVersion, 1)
  assert.deepEqual(data.manifest, benchmarkManifest(root), "Performance artifacts or harness changed; run npm run bench")
  assert.deepEqual(data.runtimes.map(runtime => runtime.id), runtimeIds, "A published receipt must include Node and all three browsers")
  for (const runtime of data.runtimes) {
    assert.ok(runtime.version)
    assert.deepEqual(runtime.cases.map(row => row.id), data.manifest.cases.map(row => row.id))
    for (const result of runtime.cases) {
      assert.deepEqual(result.parity, { compared: corpus.length, mismatches: [] })
      assert.equal(result.corpus, corpus.length)
      for (const key of ["rounds", "warmup", "batch"]) assert.equal(result[key], data.settings[key])
      for (const lane of Object.values(result.lanes)) {
        assert.equal(lane.samples.length, data.settings.rounds)
        const summary = summarize(lane.samples)
        for (const key of ["median", "p10", "p90", "min", "rounds"]) assert.equal(lane[key], summary[key])
        assert.equal(lane.expressionsPerSecond, corpus.length * 1000 / lane.median)
      }
      assert.equal(result.ratio, result.lanes.itslil.median / result.lanes.official.median)
    }
  }
  return data
}
