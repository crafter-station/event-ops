import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, "dist")
const ledgerSrc = join(here, "..", "src", "lib", "ledger.mjs")

const REQUIRED_EXPORTS = [
  "createLedger",
  "importLumaCsv",
  "importFeedbackCsv",
  "importCreditsCsv",
  "auditLedger",
  "assignCodes",
  "burnAndReplace",
  "exportDispatchRows",
  "formatCsv",
  "canonicalEmail",
  "poolStats",
  "getAssignedCode",
  "isEligible",
]

function fail(message) {
  console.error(`build failed: ${message}`)
  process.exit(1)
}

if (!existsSync(ledgerSrc)) {
  fail(
    [
      `${ledgerSrc} not found.`,
      "The site ships the CLI's real ledger, so the build needs the repo root.",
      "Deploy with `vercel build && vercel deploy --prebuilt` from site/,",
      "or set the Vercel project Root Directory to `site` and run `vercel deploy` from the repo root.",
    ].join("\n  "),
  )
}

const ledgerText = readFileSync(ledgerSrc, "utf8")
if (/^\s*import[\s{*(]/m.test(ledgerText) || /\bfrom\s*["'][^"']+["']/.test(ledgerText)) {
  fail("src/lib/ledger.mjs imports other modules; the browser sandbox needs it self-contained.")
}
if (/\bprocess\.|\bBuffer\b|\b__dirname\b/.test(ledgerText)) {
  fail("src/lib/ledger.mjs references Node globals; the browser sandbox needs it browser-safe.")
}

const mod = await import(pathToFileURL(ledgerSrc).href)
const missing = REQUIRED_EXPORTS.filter((name) => typeof mod[name] !== "function")
if (missing.length) fail(`src/lib/ledger.mjs is missing exports used by the sandbox: ${missing.join(", ")}`)

const sha = createHash("sha256").update(ledgerText).digest("hex").slice(0, 7)
const lines = ledgerText.split("\n").length

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

const html = readFileSync(join(here, "index.html"), "utf8").replaceAll("{{LEDGER_SHA}}", sha).replaceAll("{{LEDGER_LINES}}", String(lines))
writeFileSync(join(dist, "index.html"), html)

for (const file of ["app.js", "styles.css"]) {
  copyFileSync(join(here, file), join(dist, file))
}
copyFileSync(ledgerSrc, join(dist, "ledger.mjs"))

console.log(
  JSON.stringify(
    {
      ok: true,
      outDir: dist,
      files: ["index.html", "app.js", "styles.css", "ledger.mjs"],
      ledger: { source: "../src/lib/ledger.mjs", sha256: sha, lines },
    },
    null,
    2,
  ),
)
