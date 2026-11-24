#!/usr/bin/env node
// Idempotent email-first Credit Desk CLI for Luma attendees + OpenAI credits.
// Zero external dependencies. Works on Node 18+ and Bun.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  assignCodes,
  auditLedger,
  burnAndReplace,
  createLedger,
  exportDispatchRows,
  formatCsv,
  importCreditsCsv,
  importFeedbackCsv,
  importLumaCsv,
  loadLedger,
  parseRequireFlags,
  saveLedger,
} from "./core.mjs"
import { syncLumaEventGuests } from "./luma-api.mjs"

function parseArgs(argv) {
  const cmd = argv[0]
  const positionals = []
  const flags = {}
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--")) {
      const eq = a.indexOf("=")
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1)
      } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        flags[a.slice(2)] = argv[++i]
      } else {
        flags[a.slice(2)] = true
      }
    } else {
      positionals.push(a)
    }
  }
  return { cmd, positionals, flags }
}

function usage() {
  console.log(`credit-desk.mjs - Idempotent email-first Credit Desk for Luma + OpenAI credits

Commands:
  demo            Run a 1-second offline sandbox showing dedupe, feedback gate, reserve burn, and export
  init            --ledger <file> --event <slug> [--luma-event-id evt-...]
                  [--require checked-in|approved|feedback] [--target luma|chatgpt]
  sync-luma       --ledger <file> [--event-id evt-...] [--api-key <key>] [--fallback-csv <guests.csv>]
  import-luma     --ledger <file> <guests.csv> [--chatgpt-col <header>]
  import-feedback --ledger <file> <feedback.csv> [--email-col <header>]
  import-credits  --ledger <file> <codes.csv> [--code-col <header>] [--reserve <N>]
  audit           --ledger <file>
  assign          --ledger <file> [--commit] [--include-reserve]
  burn            --ledger <file> <email-or-code> [--reason <text>]
  export          --ledger <file> --out <dispatch.csv> [--all] [--mark-sent]
  send            --ledger <file> --from <addr> --subject <text> [--confirm] [--template <file>]

Notes:
  - Keep ledger and CSV files outside git (e.g. /tmp/credit-desk/<event>/ledger.json).
  - Default delivery target is the verified Luma email (--target luma). Use --target chatgpt to prefer the ChatGPT registration email.
  - assign and send are dry-run by default; pass --commit / --confirm to execute.`)
}

function requireFlag(flags, name) {
  const val = flags[name]
  if (!val || val === true) {
    console.error(`Missing required flag --${name}`)
    process.exit(2)
  }
  return val
}

function renderEmailText(template, row, eventSlug) {
  if (template) {
    return template
      .replaceAll("{{name}}", row.name)
      .replaceAll("{{code}}", row.code)
      .replaceAll("{{event}}", eventSlug)
      .replaceAll("{{email}}", row.delivery_email)
  }
  return [
    `Hi ${row.name},`,
    "",
    `Thanks for joining ${eventSlug}! Here is your personal credit code:`,
    "",
    row.code,
    "",
    "This code is unique to you (one per verified attendee). Reply if you hit any issue redeeming it.",
  ].join("\n")
}

function runDemo() {
  const dir = mkdtempSync(join(tmpdir(), "credit-desk-demo-"))
  try {
    const ledger = createLedger({
      eventSlug: "codex-lima-demo",
      require: ["checked-in", "feedback"],
      deliveryTarget: "luma",
    })
    importLumaCsv(
      ledger,
      [
        "guest_id,name,email,approval_status,checked_in_at,What is your ChatGPT email?,survey_response_rating",
        "gst-1,Alice Builder,alice@gmail.com,approved,2026-10-21T19:00:00Z,alice.ai@gmail.com,5",
        "gst-2,Alice Alias,a.l.i.c.e+dup@gmail.com,approved,2026-10-21T19:01:00Z,other@gmail.com,5",
        "gst-3,Bob Engineer,bob@company.dev,approved,2026-10-21T19:02:00Z,bob.ai@gmail.com,",
        "gst-4,Bob Alt,bob2@company.dev,approved,2026-10-21T19:03:00Z,bob.ai@gmail.com,5",
        "gst-5,No Show,noshow@example.com,approved,,noshow@example.com,5",
      ].join("\n")
    )
    importFeedbackCsv(
      ledger,
      "Email,Rating,Comment\nbob.ai@gmail.com,5,Loved the live Codex demo\n"
    )
    importCreditsCsv(ledger, "DEMO-001\nDEMO-002\nDEMO-003\n", { reserveCount: 1 })
    const audit = auditLedger(ledger)
    const assigned = assignCodes(ledger, { commit: true })
    const burned = burnAndReplace(ledger, "alice@gmail.com", "demo-broken-code")
    const rows = exportDispatchRows(ledger, { onlyUnsent: true, markSent: true })
    const csv = formatCsv(["delivery_email", "luma_email", "chatgpt_email", "name", "code"], rows)
    console.log(
      JSON.stringify(
        {
          demo: "codex-lima-demo",
          audit: { counts: audit.counts, flags: audit.flags },
          assigned: { count: assigned.assignedCount, blocked: assigned.blocked },
          burnAndReplace: { ok: burned.ok, guestId: burned.guestId, usedReserve: burned.usedReserve },
          dispatchPreviewCsv: csv.trim().split("\n"),
        },
        null,
        2
      )
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function run() {
  const { cmd, positionals, flags } = parseArgs(process.argv.slice(2))
  if (!cmd || cmd === "-h" || cmd === "--help") {
    usage()
    process.exit(cmd ? 0 : 2)
  }

  if (cmd === "demo") {
    runDemo()
    return
  }

  if (cmd === "init") {
    const ledgerPath = requireFlag(flags, "ledger")
    const eventSlug = requireFlag(flags, "event")
    const require = parseRequireFlags(flags.require)
    const ledger = createLedger({
      eventSlug,
      lumaEventId: typeof flags["luma-event-id"] === "string" ? flags["luma-event-id"] : null,
      require,
      deliveryTarget: typeof flags.target === "string" ? flags.target : "luma",
    })
    saveLedger(ledgerPath, ledger)
    console.log(
      JSON.stringify(
        {
          ok: true,
          ledgerPath,
          eventSlug,
          lumaEventId: ledger.config.lumaEventId,
          require,
          deliveryTarget: ledger.config.deliveryTarget,
        },
        null,
        2
      )
    )
    return
  }

  const ledgerPath = requireFlag(flags, "ledger")
  const ledger = loadLedger(ledgerPath)

  if (cmd === "sync-luma") {
    const apiKey = typeof flags["api-key"] === "string" ? flags["api-key"] : process.env.LUMA_API_KEY
    const eventId = typeof flags["event-id"] === "string" ? flags["event-id"] : ledger.config.lumaEventId
    if (!apiKey && typeof flags["fallback-csv"] === "string") {
      const res = importLumaCsv(ledger, readFileSync(flags["fallback-csv"], "utf8"), {
        chatgptCol: typeof flags["chatgpt-col"] === "string" ? flags["chatgpt-col"] : undefined,
      })
      saveLedger(ledgerPath, ledger)
      console.log(JSON.stringify({ ok: true, source: "csv-fallback", ...res }, null, 2))
      return
    }
    const res = await syncLumaEventGuests(ledger, { apiKey, eventId })
    if (!res.ok) {
      console.error(JSON.stringify(res, null, 2))
      process.exit(1)
    }
    saveLedger(ledgerPath, ledger)
    console.log(JSON.stringify(res, null, 2))
    return
  }

  if (cmd === "import-luma") {
    const csvPath = positionals[0]
    if (!csvPath) {
      console.error("Missing <guests.csv>")
      process.exit(2)
    }
    const res = importLumaCsv(ledger, readFileSync(csvPath, "utf8"), {
      chatgptCol: typeof flags["chatgpt-col"] === "string" ? flags["chatgpt-col"] : undefined,
    })
    saveLedger(ledgerPath, ledger)
    console.log(JSON.stringify(res, null, 2))
    return
  }

  if (cmd === "import-feedback") {
    const csvPath = positionals[0]
    if (!csvPath) {
      console.error("Missing <feedback.csv>")
      process.exit(2)
    }
    const res = importFeedbackCsv(ledger, readFileSync(csvPath, "utf8"), {
      emailCol: typeof flags["email-col"] === "string" ? flags["email-col"] : undefined,
    })
    saveLedger(ledgerPath, ledger)
    console.log(JSON.stringify(res, null, 2))
    return
  }

  if (cmd === "import-credits") {
    const csvPath = positionals[0]
    if (!csvPath) {
      console.error("Missing <codes.csv>")
      process.exit(2)
    }
    const res = importCreditsCsv(ledger, readFileSync(csvPath, "utf8"), {
      codeCol: typeof flags["code-col"] === "string" ? flags["code-col"] : undefined,
      reserveCount: Number(flags.reserve || 0),
    })
    saveLedger(ledgerPath, ledger)
    console.log(JSON.stringify(res, null, 2))
    return
  }

  if (cmd === "audit") {
    console.log(JSON.stringify(auditLedger(ledger), null, 2))
    return
  }

  if (cmd === "assign") {
    const commit = Boolean(flags.commit)
    const res = assignCodes(ledger, {
      commit,
      includeReserve: Boolean(flags["include-reserve"]),
    })
    if (commit) saveLedger(ledgerPath, ledger)
    console.log(
      JSON.stringify(
        {
          committed: res.committed,
          assignedCount: res.assignedCount,
          blocked: res.blocked,
          poolAfter: res.poolAfter,
          sample: res.plan.slice(0, 5).map((p) => ({
            name: p.name,
            deliveryEmail: p.deliveryEmail,
            codeId: p.codeId,
          })),
        },
        null,
        2
      )
    )
    return
  }

  if (cmd === "burn") {
    const query = positionals[0]
    if (!query) {
      console.error("Missing <email-or-code>")
      process.exit(2)
    }
    const res = burnAndReplace(ledger, query, typeof flags.reason === "string" ? flags.reason : "reported-broken")
    if (!res.ok) {
      console.error(JSON.stringify(res, null, 2))
      process.exit(1)
    }
    saveLedger(ledgerPath, ledger)
    console.log(JSON.stringify({ ok: true, guestId: res.guestId, usedReserve: res.usedReserve }, null, 2))
    return
  }

  if (cmd === "export") {
    const outPath = requireFlag(flags, "out")
    const markSent = Boolean(flags["mark-sent"])
    const rows = exportDispatchRows(ledger, {
      onlyUnsent: !flags.all,
      markSent,
    })
    const csv = formatCsv(["delivery_email", "luma_email", "chatgpt_email", "name", "code"], rows)
    writeFileSync(outPath, csv, { mode: 0o600 })
    if (markSent) saveLedger(ledgerPath, ledger)
    console.log(JSON.stringify({ ok: true, exported: rows.length, markedSent: markSent, outPath }, null, 2))
    return
  }

  if (cmd === "send") {
    const from = requireFlag(flags, "from")
    const subject = requireFlag(flags, "subject")
    const confirm = Boolean(flags.confirm)
    const template = typeof flags.template === "string" ? readFileSync(flags.template, "utf8") : null
    const rows = exportDispatchRows(ledger, { onlyUnsent: true, markSent: false })

    if (!confirm) {
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            pendingCount: rows.length,
            from,
            subject,
            sampleRecipients: rows.slice(0, 5).map((r) => ({ name: r.name, to: r.delivery_email })),
          },
          null,
          2
        )
      )
      return
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.error("Missing RESEND_API_KEY in environment")
      process.exit(2)
    }

    let sent = 0
    const failed = []
    for (const row of rows) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [row.delivery_email],
          subject,
          text: renderEmailText(template, row, ledger.eventSlug),
        }),
      })
      if (response.ok) {
        const codeRow = ledger.codes.find((c) => c.id === row.code_id)
        if (codeRow) codeRow.sentAt = new Date().toISOString()
        saveLedger(ledgerPath, ledger)
        sent++
      } else {
        const errText = await response.text()
        failed.push({ to: row.delivery_email, status: response.status, error: errText.slice(0, 200) })
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    console.log(JSON.stringify({ ok: failed.length === 0, sent, failed }, null, 2))
    if (failed.length) process.exit(1)
    return
  }

  console.error(`Unknown command: ${cmd}`)
  usage()
  process.exit(2)
}

run().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
