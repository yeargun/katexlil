import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

describe("site", () => {
  it("has a markedlil-style lab with receipts", () => {
    assert.equal(existsSync(resolve(root, "site/index.html")), true)
    assert.equal(existsSync(resolve(root, "site/app.js")), true)
    assert.equal(existsSync(resolve(root, "site/results.json")), true)
    const html = readFileSync(resolve(root, "site/index.html"), "utf8")
    assert.match(html, /scoreboard/)
    assert.match(html, /#evidence/)
    assert.match(html, /#lab/)
    assert.match(html, /#worlds/)
    assert.match(html, /#bytes/)
    assert.match(html, /bench\.html/)
    assert.match(html, /test\/browser-perf\.test\.mjs/)
    assert.doesNotMatch(html, /\d+\/\d+/, "test counts come from results.json, never from the HTML")
  })

  it("ships the benchmark page and the corpus it shares with Node", () => {
    assert.equal(existsSync(resolve(root, "site/bench.html")), true)
    assert.equal(existsSync(resolve(root, "site/bench.js")), true)
    assert.equal(existsSync(resolve(root, "site/corpus.js")), true)
  })

  it("publishes results that name their sources and both worlds", () => {
    const results = JSON.parse(readFileSync(resolve(root, "site/results.json"), "utf8"))
    for (const key of ["measure", "corpus", "benchPage", "browserTest", "attribution"]) assert.ok(results.sources?.[key], `sources.${key}`)
    const ids = results.size.map((lane) => lane.id)
    for (const id of ["official-terser-mangle", "official-source-terser", "itslil", "itslil-closed"]) assert.ok(ids.includes(id), id)
    assert.equal(results.size.find((lane) => lane.id === "itslil").world, "open")
    assert.equal(results.size.find((lane) => lane.id === "itslil-closed").world, "closed")
    assert.ok(results.browser?.lanes?.itslil?.median > 0, "browser median")
    assert.equal(results.browser.parity.mismatches.length, 0, "browser parity")
    assert.ok(results.throughput.find((row) => row.id === "itslil").documentMs > 0)
  })
})
