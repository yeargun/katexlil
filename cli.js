#!/usr/bin/env node

import { realpathSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { program } from "commander"
import katex from "./dist/katex.mjs"

program.name("katex").version(katex.version)
for (const prop of Object.keys(katex.SETTINGS_SCHEMA)) {
  const option = katex.SETTINGS_SCHEMA[prop]
  if (option.cli !== false) {
    program.option(
      option.cli || `--${prop}`,
      option.cliDescription || option.description,
      option.cliProcessor,
      option.cliDefault,
    )
  }
}
program
  .option("-f, --macro-file <path>", "Read macro definitions, one per line, from the given file.")
  .option("-i, --input <path>", "Read LaTeX input from the given file.")
  .option("-o, --output <path>", "Write html output to the given file.")

export { program }

function splitMacros(macroStrings, options) {
  const macros = {}
  for (const macro of macroStrings.concat(options.macro)) {
    const separator = macro.indexOf(":")
    if (separator !== -1) {
      macros[macro.slice(0, separator).trim()] = macro.slice(separator + 1).trim()
    }
  }
  return macros
}

async function main(argv) {
  const options = program.parse(argv).opts()
  const macroSource = options.macroFile ? await readFile(options.macroFile, "utf8") : ""
  options.macros = splitMacros(macroSource.split("\n"), options)
  const input = options.input ? await readFile(options.input, "utf8") : await readStdin()
  const outputFile = options.output
  options.output = options.format
  const output = `${katex.renderToString(input, options)}\n`
  if (outputFile) await writeFile(outputFile, output)
  else process.stdout.write(output)
}

async function readStdin() {
  let input = ""
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) input += chunk
  return input
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
