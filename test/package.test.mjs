import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"
import vm from "node:vm"
import { readFileSync } from "node:fs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)

describe("published surface", () => {
  it("reports the pinned upstream version in ESM, CJS, and the CLI", async () => {
    const esm = await import("@itslil/katex")
    const cjs = require("@itslil/katex")
    assert.equal(esm.version, "0.16.22")
    assert.equal(cjs.version, "0.16.22")
    assert.equal((await import("@itslil/katex/closed")).version, "0.16.22")
    assert.equal((await import("@itslil/katex/katex.js")).version, "0.16.22")
    assert.equal(require("@itslil/katex/dist/katex.js").version, "0.16.22")
    const cli = spawnSync(process.execPath, [resolve(root, "cli.js"), "--version"], { encoding: "utf8" })
    assert.equal(cli.status, 0, cli.stderr)
    assert.equal(cli.stdout.trim(), "0.16.22")
  })

  it("matches pinned upstream root and contrib export keys", async () => {
    const expectedRoot = Object.keys(await import("katex")).sort()
    assert.deepEqual(Object.keys(await import("@itslil/katex")).sort(), expectedRoot)
    assert.deepEqual(Object.keys(require("@itslil/katex")).sort(), Object.keys(require("katex")).sort())

    const expectedContrib = {
      "auto-render": ["default"],
      "copy-tex": [],
      "mathtex-script-type": [],
      "mhchem": [],
      "render-a11y-string": ["default"],
    }
    globalThis.document = {
      addEventListener() {},
      body: { getElementsByTagName() { return [] } },
    }
    for (const [name, expected] of Object.entries(expectedContrib)) {
      assert.deepEqual(Object.keys(await import(`@itslil/katex/contrib/${name}`)).sort(), expected, name)
    }
    delete globalThis.document
  })

  it("renders stdin through the CLI", async () => {
    const katex = await import("../dist/katex.mjs")
    const cli = spawnSync(process.execPath, [resolve(root, "cli.js")], {
      input: "x^2",
      encoding: "utf8",
    })
    assert.equal(cli.status, 0, cli.stderr)
    assert.equal(cli.stdout, `${katex.renderToString("x^2")}\n`)
  })

  it("loads ESM and CommonJS contrib entry points", async () => {
    const autoEsm = await import("@itslil/katex/contrib/auto-render")
    const a11yEsm = await import("@itslil/katex/contrib/render-a11y-string")
    const autoCjs = require("@itslil/katex/contrib/auto-render")
    const a11yCjs = require("@itslil/katex/contrib/render-a11y-string")
    assert.equal(typeof autoEsm.default, "function")
    assert.equal(typeof a11yEsm.default, "function")
    assert.equal(typeof autoCjs, "function")
    assert.equal(typeof a11yCjs, "function")
  })

  it("loads browser builds as classic scripts", () => {
    for (const filename of ["katex.umd.js", "katex.min.js"]) {
      let copyHandler
      const context = {
        document: {
          compatMode: "CSS1Compat",
          addEventListener(name, handler) {
            if (name === "copy") copyHandler = handler
          },
          body: { getElementsByTagName() { return [] } },
        },
      }
      context.globalThis = context
      vm.runInNewContext(readFileSync(resolve(root, "dist", filename), "utf8"), context)
      assert.equal(context.katex.version, "0.16.22")
      assert.match(context.katex.renderToString("x^2"), /<msup>/)
      if (filename === "katex.min.js") {
        vm.runInNewContext(readFileSync(resolve(root, "dist/contrib/auto-render.min.js"), "utf8"), context)
        vm.runInNewContext(readFileSync(resolve(root, "dist/contrib/render-a11y-string.min.js"), "utf8"), context)
        vm.runInNewContext(readFileSync(resolve(root, "dist/contrib/mhchem.min.js"), "utf8"), context)
        vm.runInNewContext(readFileSync(resolve(root, "dist/contrib/copy-tex.min.js"), "utf8"), context)
        vm.runInNewContext(readFileSync(resolve(root, "dist/contrib/mathtex-script-type.min.js"), "utf8"), context)
        assert.equal(typeof context.renderMathInElement, "function")
        assert.equal(context.renderA11yString("x^2"), "x, squared")
        assert.match(context.katex.renderToString("\\ce{H2O}"), /mathrm/)
        assert.equal(typeof copyHandler, "function")
      }
    }
  })

  it("matches official mhchem output", async () => {
    const local = (await import("../dist/katex.mjs")).default
    await import("../dist/contrib/mhchem.mjs")
    const official = (await import("katex")).default
    await import("katex/contrib/mhchem")
    for (const expression of ["\\ce{H2O}", "\\ce{CO2 + C -> 2 CO}", "\\pu{1.2e3 kg.m-3}"]) {
      assert.equal(local.renderToString(expression), official.renderToString(expression))
    }
    const localCjs = require("@itslil/katex")
    require("@itslil/katex/contrib/mhchem")
    assert.match(localCjs.renderToString("\\ce{H2O}"), /mathrm/)
  })

  it("matches official output across the screenshot corpus", async () => {
    const local = (await import("../dist/katex.mjs")).default
    const official = (await import("katex")).default
    await import("../dist/contrib/mhchem.mjs")
    await import("katex/contrib/mhchem")
    const corpus = require("./official/screenshotter/ss_data.cjs")
    for (const item of Object.values(corpus)) {
      const options = {
        macros: { ...item.macros },
        displayMode: item.display,
        throwOnError: !item.noThrow,
        errorColor: item.errorColor,
        strict: false,
        trust: true,
      }
      const render = (engine, renderOptions) => {
        try {
          return { html: engine.renderToString(item.tex, renderOptions) }
        } catch (error) {
          return { error: String(error) }
        }
      }
      assert.deepEqual(
        render(local, options),
        render(official, { ...options, macros: { ...item.macros } }),
        item.tex,
      )
    }
  })
})
