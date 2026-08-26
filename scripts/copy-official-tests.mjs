import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const official = "/tmp/official-repos/katex-0.16.22/test"
const dest = resolve(root, "test", "official")
const esm = "../../dist/katex.esm.js"

const files = [
  "katex-spec.js",
  "mathml-spec.js",
  "errors-spec.js",
  "unicode-spec.js",
  "dup-spec.js",
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
  const rewritten = rewriteImports(readFileSync(resolve(official, name), "utf8"))
  writeFileSync(resolve(dest, name), rewritten)
}
cpSync(resolve(official, "__snapshots__"), resolve(dest, "__snapshots__"), { recursive: true })
console.log(`copied official specs into ${dest}`)
