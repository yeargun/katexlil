import {
  accessSync,
  constants,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { performance } from "node:perf_hooks"
import { build as esbuild } from "esbuild"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const lilscriptRoot = process.env.LILSCRIPT_ROOT ?? resolve(root, "..", "lilscript")
const dist = resolve(root, "dist")
const file = "katex"
const banner = "/*! @itslil/katex 0.16.22 | LilScript reimplementation of katex | MIT */\n"
const contribDist = resolve(dist, "contrib")

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

// Compile time is a published number (site/results.json `compiler`, written by
// scripts/record-compiler.mjs). Every compiler invocation of this build is timed
// here, wall clock around the process, and written to .tmp/compile-times/ when the
// build finishes: one file per build, so a sample is always one whole build.
const compileTimes = []
function compileLil(compiler, configName, input, output) {
  const started = performance.now()
  run(compiler, [
    resolve(root, input),
    "--target",
    "js-module",
    "--config",
    resolve(root, configName),
    "-o",
    resolve(root, output),
  ])
  compileTimes.push({ input, config: configName, output, wallMs: Math.round(performance.now() - started) })
}

function writeCompileTimes(compiler) {
  if (compileTimes.length === 0) return
  const dir = resolve(root, ".tmp", "compile-times")
  mkdirSync(dir, { recursive: true })
  const at = new Date().toISOString()
  const record = { at, compiler, argv: process.argv.slice(2), invocations: compileTimes }
  writeFileSync(resolve(dir, `${at.replace(/[:.]/g, "-")}.json`), `${JSON.stringify(record, null, 2)}\n`)
}

function compileIfRequested() {
  const generated = [
    resolve(dist, `${file}.raw.js`),
    resolve(dist, `${file}.closed.raw.js`),
    resolve(dist, `${file}.test.raw.js`),
    resolve(dist, `${file}.contrib-test.js`),
  ]
  const compiler = compilerPath()
  // The compiler binary is an input: a newer compiler must recompile even when no
  // source changed, or its bytes are never measured on this port.
  const sourceMtime = Math.max(
    newestMtime(resolve(root, "src")),
    statSync(resolve(root, "test/katex.lil")).mtimeMs,
    statSync(resolve(root, "test/support.lil")).mtimeMs,
    statSync(resolve(root, "lilscript.toml")).mtimeMs,
    statSync(resolve(root, "lilscript.closed.toml")).mtimeMs,
    compiler ? statSync(compiler).mtimeMs : 0,
  )
  if (
    !process.argv.includes("--force") &&
    generated.every((path) => existsSync(path) && statSync(path).mtimeMs >= sourceMtime)
  ) {
    return
  }
  if (!compiler) {
    throw new Error("LilScript compiler not found. Set LILSCRIPT_COMPILER or build lilscript.")
  }
  mkdirSync(dist, { recursive: true })
  compileLil(compiler, mapConfig("lilscript.toml"), "src/entry.lil", `dist/${file}.raw.js`)
  compileLil(compiler, mapConfig("lilscript.closed.toml"), "src/entry.lil", `dist/${file}.closed.raw.js`)
  // The official Jest suites import internal modules; the test entry exports them next
  // to the public API, so the npm entry never has to.
  compileLil(compiler, "lilscript.toml", "test/katex.lil", `dist/${file}.test.raw.js`)
  compileLil(compiler, "lilscript.toml", "test/support.lil", `dist/${file}.contrib-test.js`)
}

// `--map`: also write dist/<name>.raw.js.map (Source Map v3, hidden mode: the JavaScript is
// byte-identical to a map-less compile). scripts/attribute-map.mjs reads it to say which .lil
// module every byte of the artifact came from. Needs a compiler that knows
// [javascript.source_map] (lilscript feature/source-maps or later).
function mapConfig(configName) {
  if (!process.argv.includes("--map")) return configName
  const withMap = `${readFileSync(resolve(root, configName), "utf8").trimEnd()}\n\n[javascript.source_map]\nenabled = true\nmode = "hidden"\ninclude_sources_content = false\n`
  const path = resolve(dist, `.${configName}.map.toml`)
  mkdirSync(dist, { recursive: true })
  writeFileSync(path, withMap)
  return path
}

function newestMtime(path) {
  const stat = statSync(path)
  if (!stat.isDirectory()) return stat.mtimeMs
  return Math.max(...readdirSync(path).map((name) => newestMtime(resolve(path, name))))
}

compileIfRequested()
mkdirSync(dist, { recursive: true })

const rawPath = resolve(dist, `${file}.raw.js`)
if (!existsSync(rawPath)) {
  throw new Error(`dist/${file}.raw.js is missing. Run with --compile after building LilScript.`)
}

// The build ships what the compiler wrote. Two regex rewrites used to live here (a `**`
// fold and a `:==x&&(y=z)` reshaping); the compiler emits neither shape now, and a
// rewrite between compiler and artifact is the first place a size number goes wrong.
const closedRaw = resolve(dist, `${file}.closed.raw.js`)
for (const path of [rawPath, closedRaw]) {
  if (!existsSync(path)) continue
  const source = readFileSync(path, "utf8")
  if (/\b\d+\s*\*\*\s*\d+/.test(source) || /:==\w+&&\(\w+=\w+\)/.test(source)) {
    throw new Error(`${path}: the compiler emitted a shape this build used to rewrite; fix the compiler, not the build`)
  }
}
// The font metrics are LilScript data (src/data.lil) and `version` a LilScript
// export: the compiler writes the whole module, and nothing is stitched in.

// src/entry.lil exports the public API and nothing else, so the compiler sees the real
// export surface and the build ships its output as written (plus the banner). The build
// used to compile the internal test exports into the npm entry and filter them out of the
// export list afterwards, which left their names unmangled and their functions uninlined.
const publicExports = "ParseError,SETTINGS_SCHEMA,__defineFunction,__defineMacro,__defineSymbol,__domTree,__parse,__renderToDomTree,__renderToHTMLTree,__setFontMetrics,default,render,renderToString,version"
function assertPublicExports(path, source) {
  const exported = [...source.matchAll(/export\s*\{([^}]*)\}/g)]
    .flatMap(([, body]) => body.split(",").map((entry) => entry.trim().split(/\s+as\s+/).at(-1)))
    .sort()
    .join(",")
  if (exported !== publicExports) throw new Error(`${path}: exports ${exported}, expected the public API ${publicExports}`)
}
const esmSource = `${banner}${readFileSync(rawPath, "utf8").trimEnd()}\n`
assertPublicExports(`dist/${file}.esm.js`, esmSource)
writeFileSync(resolve(dist, `${file}.esm.js`), esmSource)
copyFileSync(resolve(dist, `${file}.esm.js`), resolve(dist, `${file}.mjs`))

const testRaw = resolve(dist, `${file}.test.raw.js`)
if (!existsSync(testRaw)) throw new Error(`dist/${file}.test.raw.js is missing`)
writeFileSync(resolve(dist, `${file}.test.js`), `${banner}${readFileSync(testRaw, "utf8").trimEnd()}\n`)

const closedPath = resolve(dist, `${file}.closed.js`)
if (!existsSync(closedRaw)) throw new Error(`dist/${file}.closed.raw.js is missing`)
const closedSource = `${banner}${readFileSync(closedRaw, "utf8").trimEnd()}\n`
assertPublicExports(`dist/${file}.closed.js`, closedSource)
writeFileSync(closedPath, closedSource)

await esbuild({
  absWorkingDir: dist,
  entryPoints: [resolve(dist, `${file}.esm.js`)],
  outfile: resolve(dist, `${file}.cjs`),
  bundle: true,
  format: "cjs",
  platform: "neutral",
  legalComments: "none",
  // The compiler's own output is already minimal, but re-bundling to CJS splits
  // its comma-joined declarations and re-expands syntax esbuild does not know it
  // may keep. Letting esbuild minify what it emits costs nothing and recovers
  // it: 6.5 KB raw and 1.1 KB Brotli on this port. `katex.min.js` has always
  // used the full `minify: true` for the same reason.
  minifyWhitespace: true,
  minifyIdentifiers: true,
  minifySyntax: true,
  banner: { js: banner },
  footer: { js: "module.exports=module.exports.default||module.exports;" },
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
  minifyIdentifiers: true,
  minifySyntax: true,
  banner: { js: banner },
  logLevel: "error",
})

await esbuild({
  absWorkingDir: dist,
  entryPoints: [resolve(dist, `${file}.esm.js`)],
  outfile: resolve(dist, `${file}.min.js`),
  bundle: true,
  format: "iife",
  globalName: "katex",
  footer: { js: `globalThis.katex=katex.default||katex.katex||katex;` },
  legalComments: "none",
  minify: true,
  banner: { js: banner },
  logLevel: "error",
})

function compileContrib(compiler, name, source, configName = "lilscript.toml") {
  const raw = resolve(contribDist, `${name}.raw.mjs`)
  const output = resolve(contribDist, `${name}.mjs`)
  const sourcePath = resolve(root, source)
  if (
    !process.argv.includes("--force-contrib") &&
    existsSync(output) &&
    !existsSync(raw) &&
    statSync(output).mtimeMs >= Math.max(statSync(sourcePath).mtimeMs, statSync(resolve(root, configName)).mtimeMs)
  ) {
    return
  }
  if (process.argv.includes("--compile") || !existsSync(raw)) {
    compileLil(compiler, configName, source, `dist/contrib/${name}.raw.mjs`)
  }
  const compiled = readFileSync(raw, "utf8")
    .replaceAll("../../dist/katex.mjs", "../katex.mjs")
  writeFileSync(resolve(contribDist, `${name}.mjs`), `${compiled.trimEnd()}\n`)
  rmSync(raw, { force: true })
}

mkdirSync(contribDist, { recursive: true })
const compiler = compilerPath()
const compiledContrib = [
  ["auto-render", "contrib/auto-render/auto-render.lil"],
  // Its own config: lilscript.toml plus host_modules = "embed", which carries
  // contrib/copy-tex/instanceof.js (upstream's `instanceof`) into the artifact.
  ["copy-tex", "contrib/copy-tex/copy-tex.lil", "lilscript.copy-tex.toml"],
  ["mathtex-script-type", "contrib/mathtex-script-type/mathtex-script-type.lil"],
  ["mhchem", "contrib/mhchem/mhchem.lil"],
  ["render-a11y-string", "contrib/render-a11y-string/render-a11y-string.lil"],
]
for (const [name, source, configName] of compiledContrib) {
  if (!compiler) throw new Error(`LilScript compiler is required to build contrib/${name}`)
  compileContrib(compiler, name, source, configName)
}

const externalKatex = {
  name: "external-katex",
  setup(build) {
    build.onResolve({ filter: /katex\.mjs$/ }, () => ({ path: "@itslil/katex", external: true }))
  },
}
const browserKatex = {
  name: "browser-katex",
  setup(build) {
    build.onResolve({ filter: /katex\.mjs$/ }, () => ({ path: "katex-global", namespace: "katex" }))
    build.onLoad({ filter: /.*/, namespace: "katex" }, () => ({ contents: "export default globalThis.katex" }))
  },
}
const contribGlobals = {
  "auto-render": "renderMathInElement",
  "copy-tex": "katexCopyTex",
  "mathtex-script-type": "katexMathtexScriptType",
  mhchem: "katexMhchem",
  "render-a11y-string": "renderA11yString",
}
const contribDefaultExports = new Set(["auto-render", "render-a11y-string"])
for (const name of Object.keys(contribGlobals)) {
  const entry = resolve(contribDist, `${name}.mjs`)
  await esbuild({
    absWorkingDir: contribDist,
    entryPoints: [entry],
    outfile: resolve(contribDist, `${name}.cjs`),
    bundle: true,
    format: "cjs",
    platform: "node",
    plugins: [externalKatex],
    footer: contribDefaultExports.has(name)
      ? { js: "module.exports=module.exports.default||module.exports;" }
      : undefined,
    legalComments: "none",
    minifyWhitespace: true,
    logLevel: "error",
  })
  await esbuild({
    absWorkingDir: contribDist,
    entryPoints: [entry],
    outfile: resolve(contribDist, `${name}.min.js`),
    bundle: true,
    format: "iife",
    globalName: contribGlobals[name],
    plugins: [browserKatex],
    footer: contribDefaultExports.has(name)
      ? { js: `globalThis.${contribGlobals[name]}=${contribGlobals[name]}.default||${contribGlobals[name]};` }
      : undefined,
    legalComments: "none",
    minify: true,
    logLevel: "error",
  })
}

copyFileSync(resolve(root, "assets", "katex.css"), resolve(dist, "katex.css"))
copyFileSync(resolve(root, "assets", "katex.min.css"), resolve(dist, "katex.min.css"))
cpSync(resolve(root, "fonts"), resolve(dist, "fonts"), { recursive: true })

copyFileSync(resolve(root, "types", `${file}.d.ts`), resolve(dist, `${file}.d.ts`))
writeCompileTimes(compiler)
console.log(`wrote core, contrib, CSS, fonts, and declarations under dist/`)
