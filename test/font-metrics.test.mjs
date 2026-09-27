import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, it } from "node:test"
import vm from "node:vm"

// The font metrics ship as LilScript data (src/data.lil), and the compiler picks their
// encoding, so the table a user gets is whatever the built artifact decodes at load.
// `npm run audit` holds src/fontMetricsData.js (upstream's generated module) to
// katex@0.16.22; this holds every shipped build's decoded table to src/fontMetricsData.js:
// the same fonts in the same order, the same keys in the same order per font, and every
// number Object.is-equal.
//
// The probe goes through the public API. `__setFontMetrics(name, metrics)` assigns
// `metricMap[name] = metrics`; with a setter for an unused key on Object.prototype, that
// assignment calls the setter with the table as `this` and writes nothing, so the table is
// read exactly as the build decoded it and left untouched.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const probeKey = "__katexlilFontMetricsProbe"
const expected = (await import(pathToFileURL(resolve(root, "src/fontMetricsData.js")).href)).default

const probeSource = `(() => {
  let table
  Object.defineProperty(Object.prototype, ${JSON.stringify(probeKey)}, { configurable: true, set() { table = this } })
  try { katex.__setFontMetrics(${JSON.stringify(probeKey)}, undefined) } finally { delete Object.prototype[${JSON.stringify(probeKey)}] }
  return table
})()`

// The module builds decode their table in this realm. The classic-script builds decode it
// in their own context, with that context's Object.prototype, so they run `probeSource`
// there (classicScript below).
function probeIn(katex) {
  let table
  Object.defineProperty(Object.prototype, probeKey, { configurable: true, set() { table = this } })
  try {
    katex.__setFontMetrics(probeKey, undefined)
  } finally {
    delete Object.prototype[probeKey]
  }
  return table
}

function differences(actual, reference) {
  const found = []
  const keys = (value) => Object.keys(value).join(",")
  if (actual === null || typeof actual !== "object") return [`table is ${actual === null ? "null" : typeof actual}`]
  if (keys(actual) !== keys(reference)) found.push(`fonts: [${Object.keys(actual)}] vs [${Object.keys(reference)}]`)
  for (const font of Object.keys(reference)) {
    const got = actual[font]
    const want = reference[font]
    if (got === null || typeof got !== "object") {
      found.push(`${font}: ${got === null ? "null" : typeof got}`)
      continue
    }
    if (keys(got) !== keys(want)) found.push(`${font}: key order or key set differs (${Object.keys(got).length} vs ${Object.keys(want).length} keys)`)
    for (const code of Object.keys(want)) {
      const row = got[code]
      if (!Array.isArray(row)) {
        found.push(`${font}[${code}]: ${row === undefined ? "missing" : "not an array"}`)
        continue
      }
      if (row.length !== want[code].length) found.push(`${font}[${code}]: length ${row.length} vs ${want[code].length}`)
      want[code].forEach((number, index) => {
        if (!Object.is(row[index], number)) found.push(`${font}[${code}][${index}]: ${Object.is(row[index], -0) ? "-0" : row[index]} vs ${number}`)
      })
    }
  }
  return found
}

function check(table, lane) {
  assert.ok(table, `${lane}: the probe did not reach the font metrics table (did its representation change?)`)
  assert.equal(Object.hasOwn(table, probeKey), false, `${lane}: the probe wrote into the table`)
  const found = differences(table, expected)
  assert.deepEqual(found.slice(0, 20), [], `${lane}: ${found.length} differences from src/fontMetricsData.js`)
}

function classicScript(filename) {
  const context = {
    document: {
      compatMode: "CSS1Compat",
      addEventListener() {},
      body: { getElementsByTagName() { return [] } },
    },
  }
  context.globalThis = context
  vm.runInNewContext(readFileSync(resolve(root, "dist", filename), "utf8"), context)
  return vm.runInNewContext(probeSource, context)
}

describe("font metrics in the built dist", () => {
  it("reference is upstream's full table", () => {
    const fonts = Object.keys(expected)
    const entries = fonts.reduce((sum, font) => sum + Object.keys(expected[font]).length, 0)
    assert.equal(fonts.length, 18)
    assert.equal(entries, 2038)
  })

  for (const filename of ["katex.mjs", "katex.esm.js", "katex.closed.js"]) {
    it(`dist/${filename} decodes src/fontMetricsData.js exactly`, async () => {
      const katex = await import(pathToFileURL(resolve(root, "dist", filename)).href)
      check(probeIn(katex), filename)
      check(probeIn(katex.default), `${filename} default`)
    })
  }

  it("dist/katex.cjs decodes src/fontMetricsData.js exactly", () => {
    check(probeIn(require(resolve(root, "dist/katex.cjs"))), "katex.cjs")
  })

  for (const filename of ["katex.umd.js", "katex.min.js"]) {
    it(`dist/${filename} decodes src/fontMetricsData.js exactly`, () => {
      check(classicScript(filename), filename)
    })
  }
})
