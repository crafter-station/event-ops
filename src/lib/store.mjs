import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { CliError } from "../errors.mjs"

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/

export function homeDir() {
  return resolve(process.env.EVENT_OPS_HOME || join(homedir(), ".event-ops"))
}

function configPath() {
  return join(homeDir(), "config.json")
}

export function readConfig() {
  const p = configPath()
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return {}
  }
}

export function writeConfig(config) {
  atomicWrite(configPath(), `${JSON.stringify(config, null, 2)}\n`)
}

export function assertSlug(slug) {
  if (!SLUG_RE.test(slug ?? "")) {
    throw new CliError("invalid-event", `Invalid event slug "${slug}"`, {
      exit: 2,
      hint: "Use lowercase letters, digits and dashes, e.g. codex-lima-dec",
    })
  }
  return slug
}

export function eventDir(slug) {
  return join(homeDir(), "events", assertSlug(slug))
}

export function ledgerPathFor(slug) {
  return join(eventDir(slug), "ledger.json")
}

export function listEvents() {
  const dir = join(homeDir(), "events")
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "ledger.json")))
    .map((d) => d.name)
    .sort()
}

export function resolveLedger(flags) {
  if (typeof flags.ledger === "string") {
    return { path: resolve(flags.ledger), slug: null }
  }
  const slug = typeof flags.event === "string" ? flags.event : process.env.EVENT_OPS_EVENT || readConfig().currentEvent
  if (!slug) {
    throw new CliError("no-event", "No event selected", {
      exit: 3,
      hint: "Run `event-ops credits init <event>` or pass --event <slug>",
    })
  }
  return { path: ledgerPathFor(slug), slug }
}

export function loadLedger(filePath) {
  if (!existsSync(filePath)) {
    throw new CliError("ledger-not-found", `No ledger at ${filePath}`, {
      exit: 3,
      hint: "Run `event-ops credits init <event>` first",
    })
  }
  return JSON.parse(readFileSync(filePath, "utf8"))
}

export function saveLedger(filePath, ledger) {
  ledger.updatedAt = new Date().toISOString()
  atomicWrite(filePath, `${JSON.stringify(ledger, null, 2)}\n`)
}

export function atomicWrite(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, content, { mode: 0o600 })
  renameSync(tmpPath, filePath)
}
