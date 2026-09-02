import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const officialRoot = process.env.KATEX_UPSTREAM ?? "/tmp/opencode/markdown-upstreams/katex"
const official = resolve(officialRoot, "test")
const dest = resolve(root, "test", "official")
const esm = "../../dist/katex.test.js"

const files = [
  "katex-spec.js",
  "mathml-spec.js",
  "errors-spec.js",
  "unicode-spec.js",
  "dup-spec.js",
  "screenshotter-spec.js",
  "helpers.js",
  "setup.js",
]

function rewriteImports(source) {
  return source
    .replace(/from\s+["']\.\.\/katex["']/g, `from "${esm}"`)
    .replace(
      /import\s+(\w+)\s+from\s+["']\.\.\/src\/(\w+)(?:\.js)?["']/g,
      `import { $1 } from "${esm}"`,
    )
    .replace(
      /import\s+\{([^}]+)\}\s+from\s+["']\.\.\/src\/[^"']+["']/g,
      `import {$1} from "${esm}"`,
    )
}

mkdirSync(dest, { recursive: true })
for (const name of files) {
  let rewritten = rewriteImports(readFileSync(resolve(official, name), "utf8"))
  rewritten = rewritten.replace(
    'const data = require("./screenshotter/ss_data");',
    'import data from "./screenshotter/ss_data.cjs";',
  )
  if (name === "setup.js") {
    rewritten = `import { jest } from "@jest/globals";\nglobalThis.jest = jest;\n${rewritten}`
  }
  writeFileSync(resolve(dest, name), rewritten)
}
cpSync(resolve(official, "__snapshots__"), resolve(dest, "__snapshots__"), { recursive: true })
mkdirSync(resolve(dest, "screenshotter"), { recursive: true })
cpSync(resolve(official, "screenshotter", "ss_data.js"), resolve(dest, "screenshotter", "ss_data.cjs"))
cpSync(resolve(official, "screenshotter", "ss_data.yaml"), resolve(dest, "screenshotter", "ss_data.yaml"))
for (const [source, target, replacement] of [
  ["contrib/auto-render/test/auto-render-spec.js", "contrib/auto-render-spec.js", "../../../dist/contrib/auto-render.mjs"],
  ["contrib/render-a11y-string/test/render-a11y-string-spec.js", "contrib/render-a11y-string-spec.js", "../../../dist/contrib/render-a11y-string.mjs"],
]) {
  const targetPath = resolve(dest, target)
  mkdirSync(dirname(targetPath), { recursive: true })
  const rewritten = readFileSync(resolve(officialRoot, source), "utf8")
    .replace(/import\s+splitAtDelimiters\s+from\s+["']\.\.\/splitAtDelimiters["']/, 'import { splitAtDelimiters } from "../../../dist/katex.contrib-test.js"')
    .replace(/from\s+["']\.\.\/auto-render["']/, `from "${replacement}"`)
    .replace(/from\s+["']\.\.\/render-a11y-string["']/, `from "${replacement}"`)
  writeFileSync(targetPath, rewritten)
}
console.log(`copied official specs into ${dest}`)
