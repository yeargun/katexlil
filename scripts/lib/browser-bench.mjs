import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { extname, resolve, sep } from "node:path"
import { chromium, firefox, webkit } from "playwright"
import { defaults } from "../../site/runtime-benchmark.js"
import { validateSettings } from "../../site/corpus.js"

const browsers = { chromium, firefox, webkit }
const names = { chromium: "Chromium", firefox: "Firefox", webkit: "WebKit" }
const playwrightVersion = createRequire(import.meta.url)("playwright/package.json").version
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css" }

export async function serve(dir) {
  const root = resolve(dir)
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname)
      const file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`)
      if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return }
      const body = await readFile(file)
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" })
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}

export async function runBrowserBench({ siteDir, browserName = "chromium", caseId = "shipped", rounds = defaults.rounds, warmup = defaults.warmup, batch = defaults.batch, timeoutMs = 180000 } = {}) {
  if (!Object.hasOwn(browsers, browserName)) throw new Error(`Unsupported browser: ${browserName}`)
  validateSettings({ rounds, warmup, batch })
  const { server, url } = await serve(siteDir)
  let browser
  try {
    // Full Chromium's new headless mode, plus actual Firefox/WebKit engines.
    browser = await browsers[browserName].launch({ headless: true, ...(browserName === "chromium" ? { channel: "chromium" } : {}) })
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", error => errors.push(String(error)))
    const params = new URLSearchParams({ case: caseId, rounds, warmup, batch })
    await page.goto(`${url}/bench.html?${params}`)
    await page.waitForFunction(() => window.__benchResult || window.__benchError, null, { timeout: timeoutMs })
    const failure = await page.evaluate(() => window.__benchError)
    if (failure || errors.length) throw new Error(`Browser benchmark failed: ${failure ?? ""}\n${errors.join("\n")}`)
    const result = await page.evaluate(() => window.__benchResult)
    return { ...result, browser: `${names[browserName]} ${browser.version()}`, browserName, version: browser.version(), playwright: playwrightVersion }
  } finally {
    try { await browser?.close() } finally {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    }
  }
}
