#!/usr/bin/env node
import { main } from "../src/cli.mjs"

const [major] = process.versions.node.split(".").map(Number)
if (major < 18) {
  process.stderr.write(`event-ops needs Node 18 or newer (found ${process.versions.node})\n`)
  process.exit(3)
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    process.stderr.write(`${error?.stack || error}\n`)
    process.exitCode = 1
  },
)
