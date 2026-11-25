import { readFileSync } from "node:fs"
import { CliError, EXIT } from "./errors.mjs"
import { COMMANDS, findCommand, GLOBAL_FLAGS, SCHEMA_VERSION } from "./registry.mjs"
import { banner, disableColor, err, heading, out, stdoutIsTTY, table } from "./ui.mjs"

export const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version

const BOOLEAN_FLAGS = new Set(
  [...GLOBAL_FLAGS, ...COMMANDS.flatMap((c) => c.flags ?? [])].filter((f) => f.type === "boolean").map((f) => f.name),
)

export function parseArgv(argv) {
  const positionals = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === "--") {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (token === "-h") {
      flags.help = true
      continue
    }
    if (token === "-v") {
      flags.version = true
      continue
    }
    if (token.startsWith("--")) {
      const eq = token.indexOf("=")
      const name = eq === -1 ? token.slice(2) : token.slice(2, eq)
      if (eq !== -1) flags[name] = token.slice(eq + 1)
      else if (BOOLEAN_FLAGS.has(name)) flags[name] = true
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) flags[name] = argv[++i]
      else flags[name] = true
      continue
    }
    positionals.push(token)
  }
  return { positionals, flags }
}

function validate(cmd, positionals, flags) {
  const known = new Set([...GLOBAL_FLAGS, ...(cmd.flags ?? [])].map((f) => f.name))
  for (const name of Object.keys(flags)) {
    if (!known.has(name)) {
      throw new CliError("unknown-flag", `Unknown flag --${name} for \`${cmd.name}\``, {
        exit: EXIT.usage,
        hint: `Run \`event-ops ${cmd.name} --help\``,
      })
    }
  }
  for (const f of cmd.flags ?? []) {
    const v = flags[f.name]
    if (f.required && (v === undefined || v === true)) {
      throw new CliError("missing-flag", `Missing required flag --${f.name}`, { exit: EXIT.usage, hint: cmd.usage })
    }
    if (v === undefined) continue
    if (f.type === "string" && v === true) {
      throw new CliError("missing-value", `--${f.name} needs a value`, { exit: EXIT.usage, hint: cmd.usage })
    }
    if (f.type === "number") {
      const n = Number(v)
      if (!Number.isFinite(n) || n < 0) {
        throw new CliError("invalid-number", `--${f.name} must be a non-negative number`, { exit: EXIT.usage })
      }
      flags[f.name] = n
    }
  }
  const required = (cmd.args ?? []).filter((a) => a.required)
  if (positionals.length < required.length) {
    const missing = required.slice(positionals.length).map((a) => `<${a.name}>`)
    throw new CliError("missing-argument", `Missing ${missing.join(" ")}`, { exit: EXIT.usage, hint: cmd.usage })
  }
}

function helpRoot() {
  const groups = [
    ["Credits", COMMANDS.filter((c) => c.name.startsWith("credits "))],
    ["Guests", COMMANDS.filter((c) => c.name === "triage")],
    ["Agents", COMMANDS.filter((c) => c.name.startsWith("skills ") || c.name === "schema")],
    ["Local", COMMANDS.filter((c) => c.name.startsWith("events ") || c.name === "demo")],
  ]
  const lines = [
    `${heading("event-ops")} ${out.dim(`v${VERSION}`)}  Agent-first CLI for community tech events`,
    "",
    `${out.dim("Usage")}  event-ops <command> [args] [flags]`,
    "",
  ]
  const width = Math.max(...COMMANDS.map((c) => c.name.length), "event-ops skills get core".length) + 2
  const row = (left, right) => `  ${out.accent(left)}${" ".repeat(width - left.length)}${right}`
  for (const [title, cmds] of groups) {
    lines.push(heading(title))
    for (const c of cmds) lines.push(row(c.name, c.summary))
    lines.push("")
  }
  lines.push(heading("Start here"))
  lines.push(row("event-ops demo", "see the whole credit flow offline"))
  lines.push(row("event-ops skills get core", "the agent guide for this CLI"))
  lines.push("")
  lines.push(out.dim("JSON is printed automatically when stdout is not a TTY. Mutations are dry-run by default."))
  return lines.join("\n")
}

function helpGroup(prefix) {
  const cmds = COMMANDS.filter((c) => c.name.startsWith(`${prefix} `))
  return [
    heading(`event-ops ${prefix}`),
    "",
    table(
      ["", ""],
      cmds.map((c) => [`  ${out.accent(c.usage.replace("event-ops ", ""))}`, ""]),
    )
      .split("\n")
      .slice(1)
      .map((l, i) => `${l.trimEnd()}\n      ${out.dim(cmds[i].summary)}`)
      .join("\n"),
  ].join("\n")
}

function helpCommand(cmd) {
  const lines = [heading(cmd.usage), "", cmd.summary, ""]
  if (cmd.args?.length) {
    lines.push(heading("Arguments"))
    lines.push(
      table(
        ["", ""],
        cmd.args.map((a) => [`  <${a.name}>`, a.desc]),
      )
        .split("\n")
        .slice(1)
        .join("\n"),
    )
    lines.push("")
  }
  if (cmd.flags?.length) {
    lines.push(heading("Flags"))
    lines.push(
      table(
        ["", ""],
        cmd.flags.map((f) => [
          `  --${f.name}${f.type === "boolean" ? "" : ` <${f.type}>`}`,
          `${f.desc}${f.required ? out.yellow(" (required)") : ""}`,
        ]),
      )
        .split("\n")
        .slice(1)
        .join("\n"),
    )
    lines.push("")
  }
  if (cmd.env?.length) lines.push(`${out.dim("Env")}  ${cmd.env.join(", ")}`)
  if (cmd.dryRunByDefault) lines.push(out.dim("Dry-run by default."))
  lines.push(`${out.dim("Output")}  ${cmd.output}`)
  return lines.join("\n")
}

export function schema() {
  return {
    name: "event-ops",
    version: VERSION,
    schemaVersion: SCHEMA_VERSION,
    envelope: {
      success: "{ ok: true, command, data, nextSteps[] }",
      error: "{ ok: false, command, error: { code, message, hint } }",
    },
    globalFlags: GLOBAL_FLAGS,
    commands: COMMANDS.map(
      ({
        name,
        summary,
        usage,
        args = [],
        flags = [],
        env = [],
        risk,
        dryRunByDefault = false,
        usesEvent = false,
        format = "json",
        output,
        aliases = [],
      }) => ({
        name,
        summary,
        usage,
        aliases,
        args,
        flags,
        env,
        risk,
        dryRunByDefault,
        usesEvent,
        format,
        output,
      }),
    ),
    exitCodes: {
      0: "ok",
      1: "runtime or upstream failure",
      2: "usage error",
      3: "precondition not met (no event, missing env, not found)",
    },
    env: {
      LUMA_API_KEY: "Luma Plus API key for `credits sync`",
      RESEND_API_KEY: "Resend key for `credits send --confirm`",
      EVENT_OPS_HOME: "Data directory (default ~/.event-ops)",
      EVENT_OPS_EVENT: "Default event slug",
      NO_COLOR: "Disable color",
      EVENT_OPS_RESEND_URL: "Override the Resend endpoint (tests and proxies)",
    },
  }
}

async function loadHandler(cmd) {
  const noun = cmd.name.split(" ")[0]
  if (noun === "credits" || cmd.name === "demo") return (await import("./commands/credits.mjs")).handlers[cmd.name]
  if (noun === "triage") return (await import("./commands/triage.mjs")).handlers[cmd.name]
  if (noun === "skills") return (await import("./commands/skills.mjs")).handlers[cmd.name]
  if (noun === "events") return (await import("./commands/events.mjs")).handlers[cmd.name]
  if (noun === "schema") return async () => ({ data: schema(), human: () => JSON.stringify(schema(), null, 2) })
  return null
}

function emitError(error, commandName, json) {
  const payload = {
    ok: false,
    command: commandName ?? null,
    error: {
      code: error.code ?? "internal",
      message: error.message,
      hint: error.hint ?? null,
      ...(error.details ? { details: error.details } : {}),
    },
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  } else {
    process.stderr.write(`${err.red("error")} ${error.message}\n`)
    if (error.hint) process.stderr.write(`${err.dim("hint")}  ${error.hint}\n`)
  }
}

export async function main(argv) {
  const { positionals, flags } = parseArgv(argv)
  if (flags["no-color"]) disableColor()
  const json = Boolean(flags.json) || !stdoutIsTTY()

  if (flags.version) {
    process.stdout.write(json && flags.json ? `${JSON.stringify({ ok: true, version: VERSION })}\n` : `${VERSION}\n`)
    return EXIT.ok
  }

  if (!positionals.length) {
    process.stdout.write(`${helpRoot()}\n`)
    return EXIT.ok
  }

  const found = findCommand(positionals)
  if (!found) {
    const group = COMMANDS.some((c) => c.name.startsWith(`${positionals[0]} `))
    if (group && positionals.length === 1) {
      process.stdout.write(`${helpGroup(positionals[0])}\n`)
      return EXIT.ok
    }
    emitError(
      new CliError("unknown-command", `Unknown command \`${positionals.join(" ")}\``, { exit: EXIT.usage, hint: "Run `event-ops --help`" }),
      null,
      json,
    )
    return EXIT.usage
  }

  const { cmd, rest } = found
  if (flags.help) {
    process.stdout.write(`${helpCommand(cmd)}\n`)
    return EXIT.ok
  }

  try {
    validate(cmd, rest, flags)
    const handler = await loadHandler(cmd)
    if (cmd.name === "demo" && !json) banner(VERSION)
    const result = await handler({ positionals: rest, flags, json })
    const markdown = cmd.format === "markdown" && !flags.json
    if (markdown) {
      process.stdout.write(result.markdown.endsWith("\n") ? result.markdown : `${result.markdown}\n`)
    } else if (json) {
      process.stdout.write(
        `${JSON.stringify({ ok: true, command: cmd.name, data: result.data, nextSteps: result.nextSteps ?? [] }, null, 2)}\n`,
      )
    } else {
      const text = result.human ? result.human(result.data) : JSON.stringify(result.data, null, 2)
      process.stdout.write(`${text}\n`)
      if (result.nextSteps?.length) {
        process.stdout.write(`\n${out.dim("Next")}\n${result.nextSteps.map((s) => `  ${out.accent(s)}`).join("\n")}\n`)
      }
    }
    return result.exit ?? EXIT.ok
  } catch (error) {
    if (!(error instanceof CliError)) {
      const wrapped = new CliError("internal", error?.message || String(error), { exit: EXIT.failure })
      emitError(wrapped, cmd.name, json)
      return EXIT.failure
    }
    emitError(error, cmd.name, json)
    return error.exit
  }
}
