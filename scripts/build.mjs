import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { build as esbuild } from "esbuild"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const lilscriptRoot = process.env.LILSCRIPT_ROOT ?? resolve(root, "..", "lilscript")
const dist = resolve(root, "dist")
const file = "katex"
const banner = "/*! @itslil/katex 0.16.23 | LilScript reimplementation of katex | MIT */\n"

function compilerPath() {
  const candidates = [
    process.env.LILSCRIPT_COMPILER,
    resolve(lilscriptRoot, "target", "release", "lilscript"),
    resolve(lilscriptRoot, "target", "debug", "lilscript"),
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {}
  }
  return null
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: "inherit" })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function compileLil(compiler, configName, outputName) {
  run(compiler, [
    resolve(root, "src", "entry.lil"),
    "--target",
    "js-module",
    "--config",
    resolve(root, configName),
    "-o",
    resolve(dist, outputName),
  ])
}

function compileIfRequested() {
  if (!process.argv.includes("--compile") && existsSync(resolve(dist, `${file}.raw.js`))) {
    return
  }
  const compiler = compilerPath()
  if (!compiler) {
    throw new Error("LilScript compiler not found. Set LILSCRIPT_COMPILER or build lilscript.")
  }
  mkdirSync(dist, { recursive: true })
  compileLil(compiler, "lilscript.toml", `${file}.raw.js`)
  compileLil(compiler, "lilscript.closed.toml", `${file}.closed.js`)
}

compileIfRequested()
mkdirSync(dist, { recursive: true })

const rawPath = resolve(dist, `${file}.raw.js`)
if (!existsSync(rawPath)) {
  throw new Error(`dist/${file}.raw.js is missing. Run with --compile after building LilScript.`)
}

for (const name of ["data-host.js", "fontMetricsData.js", "unicodeSymbols.js"]) {
  copyFileSync(resolve(root, "src", name), resolve(dist, name))
}

function sanitizeCompiled(source) {
  return source
    .replace(/\b(\d+)\s*\*\*\s*(\d+)/g, (_, a, b) => String(Number(a) ** Number(b)))
    .replace(/:==(\w+)&&\((\w+)=(\w+)\)/g, ":$2===$1?$3:$2")
}

writeFileSync(rawPath, sanitizeCompiled(readFileSync(rawPath, "utf8")))
const closedRaw = resolve(dist, `${file}.closed.js`)
if (existsSync(closedRaw)) {
  writeFileSync(closedRaw, sanitizeCompiled(readFileSync(closedRaw, "utf8")))
}

function stitchData(compiled) {
  const metrics = readFileSync(resolve(dist, "fontMetricsData.js"), "utf8")
    .replace(/\bexport\s*\{[^}]*\}/g, "")
    .replace(/\bexport\s+default\s+/, "var fontMetricsData=")
    .replace(/\bvar e=/, "var fontMetricsData=")
    .trim()
  const symbols = readFileSync(resolve(dist, "unicodeSymbols.js"), "utf8")
    .replace(/\bexport\s*\{[^}]*\}/g, "")
    .replace(/\bexport\s+default\s+\w+;?/g, "")
    .trim()
  const body = compiled.replace(
    /import\{getFontMetricsData,getUnicodeSymbols\}from"\.\/data-host\.js";/,
    "",
  )
  const host =
    "function getFontMetricsData(){return fontMetricsData}function getUnicodeSymbols(){return unicodeSymbols}"
  return `${metrics}\n${symbols}\n${host};${body}`
}

writeFileSync(resolve(dist, `${file}.esm.js`), `${banner}${stitchData(readFileSync(rawPath, "utf8")).trimEnd()}\n`)

const closedPath = resolve(dist, `${file}.closed.js`)
if (existsSync(closedPath) && readFileSync(closedPath, "utf8").includes("data-host.js")) {
  writeFileSync(closedPath, `${banner}${stitchData(readFileSync(closedPath, "utf8")).trimEnd()}\n`)
}

await esbuild({
  absWorkingDir: dist,
  entryPoints: [resolve(dist, `${file}.esm.js`)],
  outfile: resolve(dist, `${file}.cjs`),
  bundle: true,
  format: "cjs",
  platform: "neutral",
  legalComments: "none",
  minifyWhitespace: true,
  minifyIdentifiers: false,
  minifySyntax: false,
  banner: { js: banner },
  logLevel: "error",
})

await esbuild({
  absWorkingDir: dist,
  entryPoints: [resolve(dist, `${file}.esm.js`)],
  outfile: resolve(dist, `${file}.umd.js`),
  bundle: true,
  format: "iife",
  globalName: "katex",
  footer: {
    js: `globalThis.katex=katex.default||katex.katex||katex;`,
  },
  legalComments: "none",
  minifyWhitespace: true,
  minifyIdentifiers: false,
  minifySyntax: false,
  banner: { js: banner },
  logLevel: "error",
})

copyFileSync(resolve(root, "types", `${file}.d.ts`), resolve(dist, `${file}.d.ts`))
console.log(`wrote dist/${file}.esm.js, dist/${file}.cjs, dist/${file}.umd.js, dist/${file}.closed.js`)
