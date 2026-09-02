import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib"
import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
// The upstream checkout is optional: the published katex@0.16.22 package carries the same src/ and contrib/.
const upstream = resolve(process.env.KATEX_UPSTREAM ?? (existsSync("/tmp/opencode/markdown-upstreams/katex") ? "/tmp/opencode/markdown-upstreams/katex" : resolve(root, "node_modules/katex")))
const published = resolve(root, "node_modules/katex")

function walk(path) {
  return readdirSync(path).flatMap((name) => {
    const child = resolve(path, name)
    return statSync(child).isDirectory() ? walk(child) : [child]
  })
}

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function valueDigest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function canonicalDeclaration(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\s+/g, "")
}

function size(path) {
  const bytes = readFileSync(path)
  return {
    raw: bytes.length,
    gzip9: gzipSync(bytes, { level: 9 }).length,
    brotli11: brotliCompressSync(bytes, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  }
}

const upstreamModules = walk(resolve(upstream, "src"))
  .filter((path) => path.endsWith(".js"))
  .map((path) => relative(resolve(upstream, "src"), path))
  .sort()
// unicodeSymbols is a LilScript module now (src/unicodeSymbols.lil builds the table at load,
// as upstream does); only the font metrics table stays host JavaScript.
const hostData = new Set(["fontMetricsData.js"])
const expectedModules = upstreamModules.map((path) => {
  if (hostData.has(path)) return path
  return path.replace(/\.js$/, ".lil")
})
const missingModules = expectedModules.filter((path) => !existsSync(resolve(root, "src", path)))
const upstreamContrib = walk(resolve(upstream, "contrib"))
  .filter((path) => path.endsWith(".js") && !path.includes("/test/"))
  .map((path) => relative(resolve(upstream, "contrib"), path))
  .sort()
const expectedContrib = upstreamContrib.map((path) => path.replace(/\.js$/, ".lil"))
const missingContrib = expectedContrib.filter((path) => !existsSync(resolve(root, "contrib", path)))
const runtimeHostContrib = walk(resolve(root, "contrib"))
  .filter((path) => path.endsWith(".host.mjs"))
  .map((path) => relative(resolve(root, "contrib"), path))
const runtimeHostSource = walk(resolve(root, "src"))
  .filter((path) => path.endsWith(".js") && !hostData.has(relative(resolve(root, "src"), path)))
  .map((path) => relative(resolve(root, "src"), path))

const localData = {
  "fontMetricsData.js": (await import(resolve(root, "src/fontMetricsData.js"))).default,
}
const fontSandbox = {}
runInNewContext(
  readFileSync(resolve(published, "src/fontMetricsData.js"), "utf8")
    .replace("export default", "globalThis.value ="),
  fontSandbox,
)
const officialData = {
  "fontMetricsData.js": fontSandbox.value,
}
const dataChecks = [...hostData].map((name) => {
  const local = resolve(root, "src", name)
  return {
    name,
    matchesUpstream: existsSync(local) && valueDigest(localData[name]) === valueDigest(officialData[name]),
    ...size(local),
  }
})

const assetPairs = [
  [resolve(root, "assets/katex.css"), resolve(published, "dist/katex.css")],
  [resolve(root, "assets/katex.min.css"), resolve(published, "dist/katex.min.css")],
  [resolve(root, "dist/katex.css"), resolve(published, "dist/katex.css")],
  [resolve(root, "dist/katex.min.css"), resolve(published, "dist/katex.min.css")],
]
for (const font of walk(resolve(published, "dist/fonts"))) {
  const name = relative(resolve(published, "dist/fonts"), font)
  assetPairs.push([resolve(root, "fonts", name), font])
  assetPairs.push([resolve(root, "dist/fonts", name), font])
}
const assetMismatches = assetPairs
  .filter(([local, official]) => !existsSync(local) || digest(local) !== digest(official))
  .map(([local]) => relative(root, local))

const declarationMatches = canonicalDeclaration(readFileSync(resolve(root, "types/katex.d.ts"), "utf8")) ===
  canonicalDeclaration(readFileSync(resolve(published, "types/katex.d.ts"), "utf8"))
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))
const requiredExports = [
  ".",
  "./closed",
  "./contrib/auto-render",
  "./contrib/mhchem",
  "./contrib/copy-tex",
  "./contrib/mathtex-script-type",
  "./contrib/render-a11y-string",
  "./katex.js",
  "./dist/katex.js",
  "./*",
]
const missingExports = requiredExports.filter((name) => !(name in manifest.exports))
const apiVersion = (await import(resolve(root, "dist/katex.mjs"))).version
const officialApiKeys = Object.keys(await import("katex")).sort()
const localApiKeys = Object.keys(await import(resolve(root, "dist/katex.mjs"))).sort()

const artifacts = {
  officialMin: size(resolve(published, "dist/katex.min.js")),
  lilLibrary: size(resolve(root, "dist/katex.mjs")),
  lilBrowser: size(resolve(root, "dist/katex.min.js")),
  lilClosed: size(resolve(root, "dist/katex.closed.js")),
}
const contrib = Object.fromEntries([
  "auto-render",
  "mhchem",
  "copy-tex",
  "mathtex-script-type",
  "render-a11y-string",
].map((name) => [name, {
  official: size(resolve(published, `dist/contrib/${name}.mjs`)),
  lil: size(resolve(root, `dist/contrib/${name}.mjs`)),
}]))
const report = {
  upstream: "katex@0.16.22",
  source: {
    upstreamModules: upstreamModules.length,
    mappedModules: expectedModules.length - missingModules.length,
    missingModules,
    hostData: [...hostData],
    upstreamContrib: upstreamContrib.length,
    mappedContrib: expectedContrib.length - missingContrib.length,
    missingContrib,
    lilContrib: expectedContrib,
    runtimeHostSource,
    runtimeHostContrib,
    checkedGeneratedData: dataChecks,
  },
  declarations: { matchesUpstreamSurface: declarationMatches },
  assets: { checked: assetPairs.length, mismatches: assetMismatches },
  package: {
    version: manifest.version,
    apiVersion,
    officialApiKeys,
    localApiKeys,
    missingExports,
  },
  artifacts,
  contrib,
}

console.log(JSON.stringify(report, null, 2))
if (missingModules.length || missingContrib.length || runtimeHostSource.length || runtimeHostContrib.length || dataChecks.some(({ matchesUpstream }) => !matchesUpstream) || assetMismatches.length || missingExports.length || !declarationMatches || apiVersion !== "0.16.22" || JSON.stringify(localApiKeys) !== JSON.stringify(officialApiKeys)) {
  process.exitCode = 1
}
