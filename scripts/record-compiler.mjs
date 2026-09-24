// Records which compiler built dist/ and how long it took, as the `compiler` block of
// site/results.json (scripts/measure-site.mjs carries it on later runs):
//
//   node scripts/build.mjs --compile --force --force-contrib   # three times: one sample each
//   node scripts/record-compiler.mjs [--revision <compiler git revision>] [--samples 3] [--host "<note>"]
//
// scripts/build.mjs times every compiler invocation (wall clock around the process) and writes
// one file per build to .tmp/compile-times/. This takes the newest `--samples` builds that ran
// the core compile, so each sample is one whole build on this host. Hashes are of the files on
// disk now; the revision defaults to the HEAD of LILSCRIPT_ROOT.
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { cpus } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const argv = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? fallback : argv[at + 1]
}
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")

const core = { input: "src/entry.lil", config: "lilscript.toml" }
const wanted = Number(flag("samples", 3))
const dir = resolve(root, ".tmp", "compile-times")
if (!existsSync(dir)) throw new Error("no .tmp/compile-times: run node scripts/build.mjs --compile --force first")
const builds = readdirSync(dir)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(resolve(dir, name), "utf8")))
  .filter((build) => build.invocations.some((call) => call.input === core.input && call.config === core.config))
  .slice(-wanted)
if (builds.length < wanted) throw new Error(`need ${wanted} timed builds with the core compile, found ${builds.length}`)
const compilerPath = builds.at(-1).compiler
if (builds.some((build) => build.compiler !== compilerPath)) throw new Error("the samples were built by different compilers")

const compilerRoot = process.env.LILSCRIPT_ROOT ?? resolve(root, "..", "lilscript")
const revision =
  flag("revision") ??
  (() => {
    try {
      return execFileSync("git", ["rev-parse", "--short=8", "HEAD"], { cwd: compilerRoot, encoding: "utf8" }).trim()
    } catch {
      return null
    }
  })()
const codec = process.env.LILSCRIPT_CODEC ?? resolve(compilerRoot, "target", "release", "lilscript-codec")

const byInvocation = new Map()
for (const build of builds) {
  for (const call of build.invocations) {
    const key = `${call.input}\u0000${call.config}`
    if (!byInvocation.has(key)) byInvocation.set(key, { input: call.input, config: call.config, output: call.output, wallMs: [] })
    byInvocation.get(key).wallMs.push(call.wallMs)
  }
}
const cpu = cpus()
const hostNote = flag("host", null)
const compiler = {
  revision,
  binarySha256: sha256(compilerPath),
  codecSha256: existsSync(codec) ? sha256(codec) : null,
  date: builds.at(-1).at.slice(0, 10),
  artifact: "dist/katex.esm.js",
  compile: `${core.input} with ${core.config}, --target js-module`,
  compileWallMs: builds.map((build) => build.invocations.find((call) => call.input === core.input && call.config === core.config).wallMs),
  buildCompileWallMs: builds.map((build) => build.invocations.reduce((sum, call) => sum + call.wallMs, 0)),
  invocations: [...byInvocation.values()],
  host: `${cpu.length} × ${cpu[0]?.model ?? "unknown CPU"}${hostNote ? `, ${hostNote}` : ""}`,
  method: "wall clock around each compiler process, timed by scripts/build.mjs; one sample per full build (node scripts/build.mjs --compile --force --force-contrib)",
  samplesAt: builds.map((build) => build.at),
}

const resultsPath = resolve(root, "site", "results.json")
const results = JSON.parse(readFileSync(resultsPath, "utf8"))
results.compiler = compiler
writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`)
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
console.log(
  `compiler ${revision} (${compiler.binarySha256.slice(0, 12)}): core compile ${compiler.compileWallMs.join(" / ")} ms (median ${median(compiler.compileWallMs)}), whole build ${compiler.buildCompileWallMs.join(" / ")} ms`,
)
