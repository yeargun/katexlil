// The official lanes: katex@<pin> as the JavaScript ecosystem ships it.
//
// `published()`  — the npm package's dist/katex.mjs bundled by esbuild with its runtime graph,
//                  then Terser (mangle on / off) and esbuild minify. What a user downloads.
// `fromSource()` — the package's Flow sources type-stripped with Babel, bundled by esbuild with
//                  a source map, then Terser with the map composed: the strongest JavaScript
//                  toolchain on the same source boundary the port rewrites, with every token
//                  attributable to an upstream module.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { tmpdir } from "node:os"
import { parse } from "@babel/parser"
import { transformSync } from "@babel/core"
import { build } from "esbuild"
import { minify } from "terser"

export const root = resolve(import.meta.dirname, "..", "..")
export const upstream = resolve(root, "node_modules/katex")
export const pin = JSON.parse(readFileSync(resolve(upstream, "package.json"), "utf8")).version
export const terserOptions = { module: true, compress: { passes: 3 }, mangle: true }

function walk(path) {
  return readdirSync(path).flatMap((name) => {
    const child = resolve(path, name)
    return statSync(child).isDirectory() ? walk(child) : [child]
  })
}

const esbuildBase = { bundle: true, format: "esm", platform: "neutral", legalComments: "none", write: false }

export async function published() {
  const bundle = await build({ ...esbuildBase, entryPoints: [resolve(upstream, "dist/katex.mjs")], outfile: "official.js" })
  const code = bundle.outputFiles[0].text
  const mangle = (await minify({ "official.js": code }, terserOptions)).code
  const noMangle = (await minify({ "official.js": code }, { ...terserOptions, mangle: false })).code
  const esbuildMin = (await build({ ...esbuildBase, entryPoints: [resolve(upstream, "dist/katex.mjs")], outfile: "official.min.js", minify: true })).outputFiles[0].text
  return { bundle: code, terserMangle: mangle, terserNoMangle: noMangle, esbuildMinify: esbuildMin }
}

// Babel 7 preset-flow semantics, by hand: the packages that are installed are the parser,
// core and generator, and this is every Flow node katex@0.16 uses.
const stripFlow = () => ({
  visitor: {
    "TypeAnnotation|TypeAlias|OpaqueType|InterfaceDeclaration|DeclareClass|DeclareFunction|DeclareModule|DeclareVariable|DeclareTypeAlias|DeclareOpaqueType|DeclareInterface|DeclareExportDeclaration|DeclareModuleExports"(path) {
      path.remove()
    },
    TypeCastExpression(path) { path.replaceWith(path.node.expression) },
    ImportDeclaration(path) {
      if (path.node.importKind === "type" || path.node.importKind === "typeof") return path.remove()
      const had = path.node.specifiers.length
      path.node.specifiers = path.node.specifiers.filter((s) => s.importKind !== "type" && s.importKind !== "typeof")
      if (had && path.node.specifiers.length === 0) path.remove()
    },
    ExportNamedDeclaration(path) { if (path.node.exportKind === "type") path.remove() },
    ClassProperty(path) { if (path.node.value == null) path.remove() },
    "Function|Class"(path) {
      for (const key of ["typeParameters", "superTypeParameters", "implements", "returnType", "predicate"]) if (path.node[key]) path.node[key] = null
    },
    "CallExpression|NewExpression"(path) { if (path.node.typeArguments) path.node.typeArguments = null },
    "Identifier|RestElement|AssignmentPattern|ObjectPattern|ArrayPattern"(path) {
      if (path.node.typeAnnotation) path.node.typeAnnotation = null
      if (path.node.optional) path.node.optional = false
    },
  },
})

export async function fromSource({ work = join(tmpdir(), "katexlil-official-source") } = {}) {
  rmSync(work, { recursive: true, force: true })
  const stripped = join(work, "src-root")
  const files = [resolve(upstream, "katex.js"), ...walk(resolve(upstream, "src")).filter((p) => p.endsWith(".js"))]
  for (const file of files) {
    const out = join(stripped, relative(upstream, file))
    mkdirSync(dirname(out), { recursive: true })
    const { code } = transformSync(readFileSync(file, "utf8"), {
      filename: file,
      parserOpts: { sourceType: "module", plugins: ["flow"] },
      plugins: [stripFlow],
      babelrc: false,
      configFile: false,
      compact: false,
      retainLines: true,
    })
    writeFileSync(out, code)
  }
  const bundle = await build({ ...esbuildBase, entryPoints: [join(stripped, "katex.js")], sourcemap: "external", sourceRoot: stripped, outfile: join(work, "official.bundle.js") })
  const bundledCode = bundle.outputFiles.find((f) => f.path.endsWith(".js")).text
  const bundledMap = JSON.parse(bundle.outputFiles.find((f) => f.path.endsWith(".map")).text)
  const terser = await minify({ "official.bundle.js": bundledCode }, { ...terserOptions, sourceMap: { content: bundledMap, asObject: true } })
  writeFileSync(join(work, "official.terser.js"), terser.code)
  writeFileSync(join(work, "official.terser.js.map"), JSON.stringify(terser.map))
  return { work, bundle: bundledCode, code: terser.code, map: terser.map, files: files.map((f) => relative(upstream, f)) }
}

// One measurement call for many artifacts, with the port's pinned encoders.
export function codecPath() {
  return process.env.LILSCRIPT_CODEC ?? resolve(root, "..", "lilscript", "target", "release", "lilscript-codec")
}
