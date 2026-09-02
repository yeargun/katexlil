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

function compileLil(compiler, configName, input, output) {
  run(compiler, [
    resolve(root, input),
    "--target",
    "js-module",
    "--config",
    resolve(root, configName),
    "-o",
    resolve(root, output),
  ])
}

function compileIfRequested() {
  const generated = [
    resolve(dist, `${file}.raw.js`),
    resolve(dist, `${file}.closed.raw.js`),
    resolve(dist, `${file}.contrib-test.js`),
  ]
  const sourceMtime = Math.max(
    newestMtime(resolve(root, "src")),
    statSync(resolve(root, "test/support.lil")).mtimeMs,
    statSync(resolve(root, "lilscript.toml")).mtimeMs,
    statSync(resolve(root, "lilscript.closed.toml")).mtimeMs,
  )
  if (
    !process.argv.includes("--force") &&
    generated.every((path) => existsSync(path) && statSync(path).mtimeMs >= sourceMtime)
  ) {
    return
  }
  const compiler = compilerPath()
  if (!compiler) {
    throw new Error("LilScript compiler not found. Set LILSCRIPT_COMPILER or build lilscript.")
  }
  mkdirSync(dist, { recursive: true })
  compileLil(compiler, "lilscript.toml", "src/entry.lil", `dist/${file}.raw.js`)
  compileLil(compiler, "lilscript.closed.toml", "src/entry.lil", `dist/${file}.closed.raw.js`)
  compileLil(compiler, "lilscript.toml", "test/support.lil", `dist/${file}.contrib-test.js`)
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

for (const name of ["fontMetricsData.js", "unicodeSymbols.js"]) {
  copyFileSync(resolve(root, "src", name), resolve(dist, name))
}

function sanitizeCompiled(source) {
  return source
    .replace(/\b(\d+)\s*\*\*\s*(\d+)/g, (_, a, b) => String(Number(a) ** Number(b)))
    .replace(/:==(\w+)&&\((\w+)=(\w+)\)/g, ":$2===$1?$3:$2")
}

writeFileSync(rawPath, sanitizeCompiled(readFileSync(rawPath, "utf8")))
const closedRaw = resolve(dist, `${file}.closed.raw.js`)
if (existsSync(closedRaw)) {
  const closedSource = sanitizeCompiled(readFileSync(closedRaw, "utf8"))
    .replace(/^\/\*! @itslil\/katex [^|]+\|[^\n]+\n/, banner)
  writeFileSync(closedRaw, closedSource)
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
  const body = compiled
    .replace(/import\{getFontMetricsData,getUnicodeSymbols\}from["']\.\/data-host\.js["'];/, "")
    .replace(/import\{default as generatedFontMetricsData\}from["']\.\/fontMetricsData\.js["'];/, "")
    .replace(/import\{default as generatedUnicodeSymbols\}from["']\.\/unicodeSymbols\.js["'];/, "")
  const host = "var generatedFontMetricsData=fontMetricsData,generatedUnicodeSymbols=unicodeSymbols"
  return `${metrics}\n${symbols}\n${host};${body}\nconst version="0.16.22";export{version};`
}

const publicExports = "ParseError,SETTINGS_SCHEMA,__defineFunction,__defineMacro,__defineSymbol,__domTree,__parse,__renderToDomTree,__renderToHTMLTree,__setFontMetrics,default,render,renderToString,version"
const testPath = resolve(dist, `${file}.test.js`)
const allowedExports = new Set(publicExports.split(","))
function filterExports(source) {
  return source.replace(/export\s*\{([^}]*)\}/g, (_, body) => {
    const entries = body.split(",").filter((entry) => {
      const parts = entry.trim().split(/\s+as\s+/)
      return allowedExports.has(parts[parts.length - 1])
    })
    return entries.length ? `export{${entries.join(",")}}` : ""
  })
}
const testSource = `${banner}${stitchData(readFileSync(rawPath, "utf8")).trimEnd()}\n`
writeFileSync(testPath, testSource)
writeFileSync(resolve(dist, `${file}.esm.js`), filterExports(testSource))
copyFileSync(resolve(dist, `${file}.esm.js`), resolve(dist, `${file}.mjs`))

const closedPath = resolve(dist, `${file}.closed.js`)
if (!existsSync(closedRaw)) throw new Error(`dist/${file}.closed.raw.js is missing`)
const closedSource = `${banner}${stitchData(readFileSync(closedRaw, "utf8")).trimEnd()}\n`
writeFileSync(closedPath, filterExports(closedSource))

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
  minifyIdentifiers: false,
  minifySyntax: false,
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
  const compiled = sanitizeCompiled(readFileSync(raw, "utf8"))
    .replaceAll("../../dist/katex.mjs", "../katex.mjs")
  writeFileSync(resolve(contribDist, `${name}.mjs`), `${compiled.trimEnd()}\n`)
  rmSync(raw, { force: true })
}

mkdirSync(contribDist, { recursive: true })
const compiler = compilerPath()
const compiledContrib = [
  ["auto-render", "contrib/auto-render/auto-render.lil"],
  ["copy-tex", "contrib/copy-tex/copy-tex.lil"],
  ["mathtex-script-type", "contrib/mathtex-script-type/mathtex-script-type.lil"],
  ["mhchem", "contrib/mhchem/mhchem.lil", "lilscript.mhchem.toml"],
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
console.log(`wrote core, contrib, CSS, fonts, and declarations under dist/`)
