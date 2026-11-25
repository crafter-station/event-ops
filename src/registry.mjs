export const SCHEMA_VERSION = 1

export const GLOBAL_FLAGS = [
  { name: "json", type: "boolean", desc: "Print the JSON envelope (automatic when stdout is not a TTY)" },
  { name: "event", type: "string", desc: "Event slug (defaults to the current event, or EVENT_OPS_EVENT)" },
  { name: "ledger", type: "string", desc: "Explicit ledger file path, overrides --event" },
  { name: "no-color", type: "boolean", desc: "Disable color (NO_COLOR is also respected)" },
  { name: "help", type: "boolean", desc: "Show help for a command" },
  { name: "version", type: "boolean", desc: "Print the version" },
]

const EVENT = { usesEvent: true }

export const COMMANDS = [
  {
    name: "demo",
    summary: "Run the offline sandbox: dedupe, feedback gate, reserve burn and export",
    usage: "event-ops demo",
    flags: [],
    risk: "none",
    output: "{ event, audit, assigned, burnAndReplace, dispatchPreviewCsv }",
  },
  {
    name: "credits init",
    summary: "Create an event ledger and make it the current event",
    usage: "event-ops credits init <event> [--luma-event-id evt-…] [--require checked-in,feedback] [--target luma|chatgpt]",
    args: [{ name: "event", required: true, desc: "Event slug, e.g. codex-lima-dec" }],
    flags: [
      { name: "luma-event-id", type: "string", desc: "Luma event API id (evt-…)" },
      { name: "require", type: "string", desc: "Comma list of gates: approved, checked-in, feedback (default checked-in)" },
      { name: "target", type: "string", desc: "Delivery inbox: luma (default) or chatgpt" },
      { name: "force", type: "boolean", desc: "Overwrite an existing ledger for this event" },
    ],
    risk: "local",
    output: "{ event, ledgerPath, lumaEventId, require, target }",
  },
  {
    name: "credits sync",
    summary: "Pull guests and check-ins from the Luma API, or from a Guests CSV export",
    usage: "event-ops credits sync [--csv guests.csv] [--luma-event-id evt-…]",
    flags: [
      { name: "csv", type: "string", desc: "Luma Guests CSV (used when LUMA_API_KEY is not set, or to force CSV)" },
      { name: "luma-event-id", type: "string", desc: "Override the Luma event id" },
      { name: "chatgpt-col", type: "string", desc: "Header of the ChatGPT email question (auto-detected)" },
    ],
    env: ["LUMA_API_KEY"],
    risk: "local",
    ...EVENT,
    output: "{ source, added, updated, skipped, totalGuests }",
  },
  {
    name: "credits import",
    summary: "Import guests, feedback or credit codes from a CSV",
    usage: "event-ops credits import <guests|feedback|codes> <file.csv> [--reserve N]",
    args: [
      { name: "kind", required: true, desc: "guests | feedback | codes" },
      { name: "file", required: true, desc: "CSV path" },
    ],
    flags: [
      { name: "reserve", type: "number", desc: "codes: hold N codes back for burn and replace" },
      { name: "code-col", type: "string", desc: "codes: header of the code column (auto-detected)" },
      { name: "email-col", type: "string", desc: "feedback: header of the email column (auto-detected)" },
      { name: "chatgpt-col", type: "string", desc: "guests: header of the ChatGPT email question (auto-detected)" },
    ],
    risk: "local",
    ...EVENT,
    output: "{ kind, …import result }",
  },
  {
    name: "credits status",
    summary: "Funnel, code pool and duplicate-identity flags",
    usage: "event-ops credits status",
    aliases: ["credits audit"],
    flags: [],
    risk: "none",
    ...EVENT,
    output: "{ eventSlug, require, deliveryTarget, counts, pool, flags }",
  },
  {
    name: "credits assign",
    summary: "Plan one code per eligible guest (dry-run unless --commit)",
    usage: "event-ops credits assign [--commit] [--include-reserve]",
    flags: [
      { name: "commit", type: "boolean", desc: "Write the assignment to the ledger" },
      { name: "include-reserve", type: "boolean", desc: "Allow reserve codes to be assigned" },
    ],
    risk: "local",
    dryRunByDefault: true,
    ...EVENT,
    output: "{ committed, assignedCount, blocked[], poolAfter, plan[] }",
  },
  {
    name: "credits burn",
    summary: "Mark an assigned code broken and assign a replacement",
    usage: "event-ops credits burn <email|code> [--reason text]",
    args: [{ name: "query", required: true, desc: "Attendee email or the code itself" }],
    flags: [{ name: "reason", type: "string", desc: "Why it was burned (default reported-broken)" }],
    risk: "local",
    ...EVENT,
    output: "{ guestId, usedReserve }",
  },
  {
    name: "credits export",
    summary: "Write a mail-merge CSV of assigned, unsent codes",
    usage: "event-ops credits export [--out file.csv] [--mark-sent] [--all]",
    flags: [
      { name: "out", type: "string", desc: "Output path (default: the event folder)" },
      { name: "mark-sent", type: "boolean", desc: "Mark exported codes as sent" },
      { name: "all", type: "boolean", desc: "Include codes already sent" },
    ],
    risk: "local",
    ...EVENT,
    output: "{ exported, markedSent, outPath }",
  },
  {
    name: "credits send",
    summary: "Email each assigned code via Resend (dry-run unless --confirm)",
    usage: 'event-ops credits send --from "Host <host@domain>" --subject "Your credits" [--template file.txt] [--confirm]',
    flags: [
      { name: "from", type: "string", required: true, desc: "Verified Resend sender" },
      { name: "subject", type: "string", required: true, desc: "Email subject" },
      { name: "template", type: "string", desc: "Text template with {{name}} {{code}} {{event}} {{email}}" },
      { name: "confirm", type: "boolean", desc: "Actually send" },
      { name: "retry-pending", type: "boolean", desc: "Retry codes whose previous send never confirmed" },
    ],
    env: ["RESEND_API_KEY"],
    risk: "external",
    dryRunByDefault: true,
    ...EVENT,
    output: "{ dryRun, pending, sent, failed[], skippedPending }",
  },
  {
    name: "triage",
    summary: "Enrich a Luma guest export with GitHub and web evidence for approval decisions",
    usage: "event-ops triage <guests.csv> [--status pending_approval] [--out enriched.json]",
    args: [{ name: "file", required: true, desc: "Luma Guests CSV" }],
    flags: [
      { name: "status", type: "string", desc: "Only guests with this approval_status" },
      { name: "out", type: "string", desc: "Write the report to a file instead of stdout" },
    ],
    requires: ["gh (authenticated) for GitHub lookups"],
    risk: "none",
    output: "{ total, counts, questions, filtered, guests[] }",
  },
  {
    name: "events list",
    summary: "List local event ledgers",
    usage: "event-ops events list",
    flags: [],
    risk: "none",
    output: "{ home, current, events[] }",
  },
  {
    name: "events use",
    summary: "Set the current event",
    usage: "event-ops events use <event>",
    args: [{ name: "event", required: true, desc: "Event slug" }],
    flags: [],
    risk: "local",
    output: "{ current }",
  },
  {
    name: "skills list",
    summary: "List the agent guides bundled in this CLI",
    usage: "event-ops skills list",
    flags: [],
    risk: "none",
    output: "{ skills[] }",
  },
  {
    name: "skills get",
    summary: "Print a bundled agent guide as Markdown (always current with this binary)",
    usage: "event-ops skills get <name>",
    args: [{ name: "name", required: true, desc: "core | credits | triage | playbook" }],
    flags: [],
    risk: "none",
    format: "markdown",
    output: "Markdown on stdout; { name, version, content } with --json",
  },
  {
    name: "schema",
    summary: "Machine-readable command contract",
    usage: "event-ops schema",
    flags: [],
    risk: "none",
    output: "{ name, version, schemaVersion, commands[], exitCodes, env }",
  },
]

export function findCommand(words) {
  for (const len of [2, 1]) {
    const name = words.slice(0, len).join(" ")
    const cmd = COMMANDS.find((c) => c.name === name || c.aliases?.includes(name))
    if (cmd) return { cmd, rest: words.slice(len) }
  }
  return null
}
