import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const json = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" })
const result = JSON.parse(json)[0]
const file = "katex"
const required = new Set([
  `dist/${file}.esm.js`,
  `dist/${file}.mjs`,
  `dist/${file}.cjs`,
  `dist/${file}.umd.js`,
  `dist/${file}.min.js`,
  `dist/${file}.closed.js`,
  `dist/${file}.d.ts`,
  `dist/${file}.css`,
  `dist/${file}.min.css`,
  "dist/contrib/auto-render.mjs",
  "dist/contrib/auto-render.cjs",
  "dist/contrib/mhchem.mjs",
  "dist/contrib/mhchem.cjs",
  "dist/contrib/copy-tex.mjs",
  "dist/contrib/copy-tex.cjs",
  "dist/contrib/mathtex-script-type.mjs",
  "dist/contrib/mathtex-script-type.cjs",
  "dist/contrib/render-a11y-string.mjs",
  "dist/contrib/render-a11y-string.cjs",
  "dist/fonts/KaTeX_Main-Regular.woff2",
  "contrib/mhchem/mhchem.lil",
  "contrib/render-a11y-string/render-a11y-string.lil",
  "cli.js",
  "katex.js",
  "LICENSE",
  "NOTICE.md",
  "README.md",
])
const files = new Set(result.files.map(({ path }) => path))
for (const path of required) {
  if (!files.has(path)) throw new Error(`npm tarball is missing ${path}`)
}
for (const path of files) {
  if (path.endsWith(".host.mjs")) throw new Error(`npm tarball contains runtime host module ${path}`)
  if (path.includes("test")) throw new Error(`npm tarball contains test-only artifact ${path}`)
}
const manifest = JSON.parse(readFileSync("package.json", "utf8"))
if (manifest.name !== "@itslil/katex") throw new Error("unexpected package name")
if (manifest.dependencies?.commander !== "^8.3.0") throw new Error("CLI commander dependency is not pinned")
console.log(`npm pack: ${result.entryCount} files, ${result.size} bytes packed, ${result.unpackedSize} bytes unpacked`)
