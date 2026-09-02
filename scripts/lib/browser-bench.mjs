// Drives site/bench.html in headless Chromium through Playwright and returns its result.
// Used by test/browser-perf.test.mjs (the gate) and scripts/measure-site.mjs (the receipt).
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"
import { chromium } from "playwright"

const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" }

export async function serve(dir) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "")
    const file = join(dir, path === "/" || path === "\\" ? "index.html" : path)
    try {
      const body = await readFile(file)
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}

export async function runBrowserBench({ siteDir, rounds = 30, warmup = 5, timeoutMs = 180000 } = {}) {
  const { server, url } = await serve(siteDir)
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", (error) => errors.push(String(error)))
    await page.goto(`${url}/bench.html?rounds=${rounds}&warmup=${warmup}`)
    await page.waitForFunction(() => window.__benchResult || window.__benchError, null, { timeout: timeoutMs })
    const failure = await page.evaluate(() => window.__benchError)
    if (failure) throw new Error(`bench page failed: ${failure}\n${errors.join("\n")}`)
    const result = await page.evaluate(() => window.__benchResult)
    return { ...result, browser: `Chromium ${browser.version()}`, playwright: (await import("playwright/package.json", { with: { type: "json" } })).default.version }
  } finally {
    await browser.close()
    server.close()
  }
}
