// Each comparison gets a fresh Node process; module loading is outside timed samples.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { runComparison } from "../site/runtime-benchmark.js"

const [root, caseId, settingsJSON] = process.argv.slice(2)
const manifest = JSON.parse(readFileSync(resolve(root, "runtime-manifest.json"), "utf8"))
const comparison = manifest.cases.find(row => row.id === caseId)
if (!comparison) throw new Error(`Unknown comparison: ${caseId}`)
const result = await runComparison(comparison, artifact => import(pathToFileURL(resolve(root, artifact.url))), JSON.parse(settingsJSON))
console.log(JSON.stringify(result))
