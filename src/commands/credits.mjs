import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { CliError, EXIT } from "../errors.mjs"
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
  parseRequireFlags,
} from "../lib/ledger.mjs"
import { syncLumaEventGuests } from "../lib/luma-api.mjs"
import { assertSlug, eventDir, ledgerPathFor, loadLedger, readConfig, resolveLedger, saveLedger, writeConfig } from "../lib/store.mjs"
import { heading, keyValues, out, progress, progressDone, table, tilde } from "../ui.mjs"

const DISPATCH_HEADERS = ["delivery_email", "luma_email", "chatgpt_email", "name", "code"]

function readFile(path) {
  const full = resolve(path)
  if (!existsSync(full)) throw new CliError("file-not-found", `File not found: ${path}`, { exit: EXIT.precondition })
  return readFileSync(full, "utf8")
}

function wrapInput(fn) {
  try {
    return fn()
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError("invalid-input", error.message, { exit: EXIT.usage })
  }
}

function open(flags) {
  const { path, slug } = resolveLedger(flags)
  return { path, slug, ledger: loadLedger(path) }
}

function poolLine(pool) {
  return [
    `${out.bold(pool.free)} free`,
    `${pool.reserve} reserve`,
    `${out.bold(pool.assigned)} assigned`,
    `${pool.sent} sent`,
    pool.sending ? out.yellow(`${pool.sending} unconfirmed`) : null,
    pool.burned ? `${pool.burned} burned` : null,
  ]
    .filter(Boolean)
    .join(out.dim("  ·  "))
}

function renderAudit(a) {
  const flagged = a.flags.duplicateCanonicalEmails.length + a.flags.sharedChatgptEmails.length + a.flags.sameNameMultiEmails.length
  const lines = [
    heading(a.eventSlug),
    keyValues([
      ["gates", a.require.join(", ")],
      ["delivers to", a.deliveryTarget === "luma" ? "Luma email" : "ChatGPT email"],
      ["luma event", a.lumaEventId ?? out.dim("not set")],
    ]),
    "",
    heading("Funnel"),
    table(
      ["guests", "approved", "checked in", "feedback", "eligible"],
      [[a.counts.total, a.counts.approved, a.counts.checkedIn, a.counts.feedback, out.bold(a.counts.eligible)].map(String)],
    ),
    "",
    heading("Codes"),
    poolLine(a.pool),
    "",
    heading(flagged ? `Flags ${out.yellow(`(${flagged})`)}` : `Flags ${out.green("(none)")}`),
  ]
  for (const d of a.flags.duplicateCanonicalEmails) lines.push(`  ${out.yellow("same inbox")}     ${d.emails.join(", ")}`)
  for (const d of a.flags.sharedChatgptEmails) lines.push(`  ${out.yellow("one ChatGPT")}    ${d.lumaEmails.join(", ")}`)
  for (const d of a.flags.sameNameMultiEmails) lines.push(`  ${out.dim("same name")}      ${d.name}: ${d.emails.join(", ")}`)
  if (a.flags.missingChatgptEmailCount) {
    lines.push(
      `  ${out.dim(`${a.flags.missingChatgptEmailCount} eligible ${a.flags.missingChatgptEmailCount === 1 ? "guest" : "guests"} without a ChatGPT email`)}`,
    )
  }
  return lines.join("\n")
}

function auditNextSteps(a) {
  if (!a.counts.total) return ["event-ops credits sync --csv <guests.csv>"]
  if (!a.pool.total) return ["event-ops credits import codes <codes.csv> --reserve 5"]
  if (a.counts.eligible && a.pool.free) return ["event-ops credits assign"]
  if (a.pool.assigned > a.pool.sent) return ["event-ops credits send --from … --subject …", "event-ops credits export --mark-sent"]
  return []
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

function demo() {
  const ledger = createLedger({ eventSlug: "codex-lima-demo", require: ["checked-in", "feedback"], deliveryTarget: "luma" })
  importLumaCsv(
    ledger,
    [
      "guest_id,name,email,approval_status,checked_in_at,What is your ChatGPT email?,survey_response_rating",
      "gst-1,Alice Builder,alice@gmail.com,approved,2026-10-21T19:00:00Z,alice.ai@gmail.com,5",
      "gst-2,Alice Alias,a.l.i.c.e+dup@gmail.com,approved,2026-10-21T19:01:00Z,other@gmail.com,5",
      "gst-3,Bob Engineer,bob@company.dev,approved,2026-10-21T19:02:00Z,bob.ai@gmail.com,",
      "gst-4,Bob Alt,bob2@company.dev,approved,2026-10-21T19:03:00Z,bob.ai@gmail.com,5",
      "gst-5,No Show,noshow@example.com,approved,,noshow@example.com,5",
    ].join("\n"),
  )
  importFeedbackCsv(ledger, "Email,Rating,Comment\nbob.ai@gmail.com,5,Loved the live Codex demo\n")
  importCreditsCsv(ledger, "DEMO-001\nDEMO-002\nDEMO-003\n", { reserveCount: 1 })
  const audit = auditLedger(ledger)
  const assigned = assignCodes(ledger, { commit: true })
  const burned = burnAndReplace(ledger, "alice@gmail.com", "demo-broken-code")
  const rows = exportDispatchRows(ledger, { onlyUnsent: true, markSent: true })
  const csv = formatCsv(DISPATCH_HEADERS, rows)
  return {
    data: {
      event: ledger.eventSlug,
      audit: { counts: audit.counts, flags: audit.flags },
      assigned: { count: assigned.assignedCount, blocked: assigned.blocked },
      burnAndReplace: { ok: burned.ok, guestId: burned.guestId, usedReserve: burned.usedReserve },
      dispatchPreviewCsv: csv.trim().split("\n"),
    },
    human: (d) =>
      [
        `${heading("Sandbox")} ${out.dim("5 fake guests · gates checked-in + feedback · 3 codes, 1 in reserve")}`,
        "",
        `${out.dim("1")}  ${d.audit.counts.total} guests imported, ${out.bold(d.audit.counts.eligible)} eligible`,
        `${out.dim("2")}  duplicate inbox flagged     ${d.audit.flags.duplicateCanonicalEmails.map((f) => f.emails.join(" = ")).join("; ")}`,
        `${out.dim("3")}  shared ChatGPT flagged      ${d.audit.flags.sharedChatgptEmails.map((f) => f.lumaEmails.join(" + ")).join("; ")}`,
        `${out.dim("4")}  ${out.bold(d.assigned.count)} assigned, ${d.assigned.blocked.length} blocked  ${out.dim(d.assigned.blocked.map((b) => `${b.email} (${b.reason})`).join(", "))}`,
        `${out.dim("5")}  burned alice's code, replaced from ${d.burnAndReplace.usedReserve ? "reserve" : "free pool"}`,
        `${out.dim("6")}  dispatch CSV`,
        "",
        ...d.dispatchPreviewCsv.map((l, i) => `     ${i === 0 ? out.dim(l) : l}`),
      ].join("\n"),
    nextSteps: ["event-ops credits init <event> --luma-event-id evt-…", "event-ops skills get core"],
  }
}

export const handlers = {
  demo: async () => demo(),

  "credits init": async ({ positionals, flags }) => {
    const slug = assertSlug(positionals[0])
    const path = ledgerPathFor(slug)
    if (existsSync(path) && !flags.force) {
      throw new CliError("event-exists", `Event "${slug}" already has a ledger`, {
        exit: EXIT.precondition,
        hint: `Run \`event-ops events use ${slug}\` to select it, or pass --force to start over`,
      })
    }
    const ledger = wrapInput(() =>
      createLedger({
        eventSlug: slug,
        lumaEventId: flags["luma-event-id"] ?? null,
        require: parseRequireFlags(flags.require),
        deliveryTarget: flags.target ?? "luma",
      }),
    )
    saveLedger(path, ledger)
    writeConfig({ ...readConfig(), currentEvent: slug })
    const data = {
      event: slug,
      ledgerPath: path,
      lumaEventId: ledger.config.lumaEventId,
      require: ledger.config.require,
      target: ledger.config.deliveryTarget,
    }
    return {
      data,
      human: (d) =>
        [
          `${out.green("created")} ${out.bold(d.event)} ${out.dim("(current event)")}`,
          keyValues([
            ["ledger", tilde(d.ledgerPath)],
            ["gates", d.require.join(", ")],
            ["delivers to", d.target],
            ["luma event", d.lumaEventId ?? out.dim("not set")],
          ]),
        ].join("\n"),
      nextSteps: [
        process.env.LUMA_API_KEY ? "event-ops credits sync" : "event-ops credits sync --csv <guests.csv>",
        "event-ops credits import codes <codes.csv> --reserve 5",
      ],
    }
  },

  "credits sync": async ({ flags }) => {
    const { path, ledger } = open(flags)
    const apiKey = process.env.LUMA_API_KEY
    let data
    if (flags.csv) {
      data = { source: "csv", ...wrapInput(() => importLumaCsv(ledger, readFile(flags.csv), { chatgptCol: flags["chatgpt-col"] })) }
    } else {
      if (!apiKey) {
        throw new CliError("missing-luma-api-key", "LUMA_API_KEY is not set", {
          exit: EXIT.precondition,
          hint: "Export it (Luma Plus) or pass --csv <guests.csv> from Luma → Guests → Export",
        })
      }
      progress("syncing guests from Luma…")
      let res
      try {
        res = await syncLumaEventGuests(ledger, { apiKey, eventId: flags["luma-event-id"] })
      } catch (error) {
        progressDone()
        throw new CliError("luma-api-failed", error.message, { exit: EXIT.failure, hint: "Check the key and event id, or use --csv" })
      }
      progressDone()
      if (!res.ok) throw new CliError(res.error, res.message, { exit: EXIT.precondition })
      const { ok, ...rest } = res
      data = { source: "luma-api", ...rest }
    }
    saveLedger(path, ledger)
    return {
      data,
      human: (d) =>
        `${out.green("synced")} from ${d.source === "csv" ? "CSV" : "Luma API"}: ${out.bold(d.added)} added, ${d.updated} updated, ${d.skipped} skipped ${out.dim(`(${d.totalGuests} guests)`)}`,
      nextSteps: ["event-ops credits status"],
    }
  },

  "credits import": async ({ positionals, flags }) => {
    const [kind, file] = positionals
    const { path, ledger } = open(flags)
    let result
    if (kind === "guests") result = wrapInput(() => importLumaCsv(ledger, readFile(file), { chatgptCol: flags["chatgpt-col"] }))
    else if (kind === "feedback") result = wrapInput(() => importFeedbackCsv(ledger, readFile(file), { emailCol: flags["email-col"] }))
    else if (kind === "codes")
      result = wrapInput(() => importCreditsCsv(ledger, readFile(file), { codeCol: flags["code-col"], reserveCount: flags.reserve ?? 0 }))
    else throw new CliError("invalid-kind", `Unknown import kind "${kind}"`, { exit: EXIT.usage, hint: "Use guests, feedback or codes" })
    saveLedger(path, ledger)
    const data = { kind, ...result }
    return {
      data,
      human: (d) => {
        if (d.kind === "feedback") {
          return `${out.green("imported")} feedback: ${out.bold(d.matched)} matched${d.unmatched.length ? out.yellow(`, ${d.unmatched.length} unmatched`) : ""} ${out.dim(`(column "${d.emailCol}")`)}`
        }
        if (d.kind === "codes") {
          return `${out.green("imported")} codes\n${poolLine(d.pool ?? auditLedger(ledger).pool)}`
        }
        return `${out.green("imported")} guests: ${out.bold(d.added)} added, ${d.updated} updated, ${d.skipped} skipped ${out.dim(`(${d.totalGuests} total)`)}`
      },
      nextSteps: ["event-ops credits status"],
    }
  },

  "credits status": async ({ flags }) => {
    const { ledger } = open(flags)
    const data = auditLedger(ledger)
    return { data, human: renderAudit, nextSteps: auditNextSteps(data) }
  },

  "credits assign": async ({ flags }) => {
    const { path, ledger } = open(flags)
    const commit = Boolean(flags.commit)
    const res = assignCodes(ledger, { commit, includeReserve: Boolean(flags["include-reserve"]) })
    if (commit) saveLedger(path, ledger)
    const data = {
      committed: res.committed,
      assignedCount: res.assignedCount,
      blocked: res.blocked,
      poolAfter: res.poolAfter,
      plan: res.plan.map((p) => ({ name: p.name, deliveryEmail: p.deliveryEmail, codeId: p.codeId })),
    }
    return {
      data,
      human: (d) => {
        const lines = [
          d.committed
            ? `${out.green("assigned")} ${out.bold(d.assignedCount)} codes`
            : `${out.yellow("dry-run")} would assign ${out.bold(d.assignedCount)} codes ${out.dim("(nothing written)")}`,
        ]
        if (d.plan.length) {
          lines.push(
            "",
            table(
              ["guest", "delivers to", "code"],
              d.plan.slice(0, 15).map((p) => [p.name, p.deliveryEmail, out.dim(p.codeId)]),
            ),
          )
          if (d.plan.length > 15) lines.push(out.dim(`… ${d.plan.length - 15} more`))
        }
        if (d.blocked.length) {
          lines.push("", heading(`Blocked ${out.yellow(`(${d.blocked.length})`)}`))
          lines.push(
            table(
              ["guest", "reason"],
              d.blocked.map((b) => [b.email, out.yellow(b.reason)]),
            ),
          )
        }
        lines.push("", poolLine(d.poolAfter))
        return lines.join("\n")
      },
      nextSteps: commit
        ? ['event-ops credits send --from "Host <you@domain>" --subject "Your credits"', "event-ops credits export --mark-sent"]
        : ["event-ops credits assign --commit"],
    }
  },

  "credits burn": async ({ positionals, flags }) => {
    const { path, ledger } = open(flags)
    const res = burnAndReplace(ledger, positionals[0], flags.reason ?? "reported-broken")
    if (!res.ok) {
      const hint =
        res.error === "no-replacement-available"
          ? "Import more codes: `event-ops credits import codes <file>`"
          : "Check `event-ops credits status`"
      throw new CliError(
        res.error,
        res.error === "no-replacement-available"
          ? "No free or reserve code left to replace it"
          : "No assigned code matches that email or code",
        {
          exit: EXIT.precondition,
          hint,
        },
      )
    }
    saveLedger(path, ledger)
    return {
      data: { guestId: res.guestId, usedReserve: res.usedReserve },
      human: (d) =>
        `${out.green("replaced")} code for ${out.bold(d.guestId)} ${out.dim(d.usedReserve ? "(from reserve)" : "(from free pool)")}`,
      nextSteps: ["event-ops credits send --from … --subject … --confirm", "event-ops credits export --mark-sent"],
    }
  },

  "credits export": async ({ flags }) => {
    const { path, slug, ledger } = open(flags)
    const markSent = Boolean(flags["mark-sent"])
    const rows = exportDispatchRows(ledger, { onlyUnsent: !flags.all, markSent })
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const outPath = resolve(flags.out ?? join(slug ? eventDir(slug) : resolve(path, ".."), `dispatch-${stamp}.csv`))
    writeFileSync(outPath, formatCsv(DISPATCH_HEADERS, rows), { mode: 0o600 })
    if (markSent) saveLedger(path, ledger)
    return {
      data: { exported: rows.length, markedSent: markSent, outPath },
      human: (d) =>
        `${out.green("exported")} ${out.bold(d.exported)} rows → ${tilde(d.outPath)}${d.markedSent ? out.dim("  (marked sent)") : ""}`,
      nextSteps: markSent ? ["event-ops credits status"] : ["event-ops credits export --mark-sent  # once the mail merge went out"],
    }
  },

  "credits send": async ({ flags }) => {
    const { path, ledger } = open(flags)
    const template = flags.template ? readFile(flags.template) : null
    const retryPending = Boolean(flags["retry-pending"])
    const rows = exportDispatchRows(ledger, { onlyUnsent: true, includePending: retryPending })
    const skippedPending = retryPending ? 0 : ledger.codes.filter((c) => c.status === "assigned" && !c.sentAt && c.sendPendingAt).length

    if (!flags.confirm) {
      return {
        data: {
          dryRun: true,
          pending: rows.length,
          skippedPending,
          from: flags.from,
          subject: flags.subject,
          sample: rows.slice(0, 5).map((r) => ({ name: r.name, to: r.delivery_email })),
          preview: rows[0] ? renderEmailText(template, { ...rows[0], code: "XXXX-XXXX" }, ledger.eventSlug) : null,
        },
        human: (d) =>
          [
            `${out.yellow("dry-run")} would email ${out.bold(d.pending)} attendees ${out.dim("(nothing sent)")}`,
            keyValues([
              ["from", d.from],
              ["subject", d.subject],
            ]),
            d.skippedPending
              ? out.yellow(`${d.skippedPending} unconfirmed from a previous run are skipped; check Resend, then --retry-pending`)
              : null,
            d.sample.length
              ? `\n${table(
                  ["name", "to"],
                  d.sample.map((s) => [s.name, s.to]),
                )}`
              : null,
            d.preview
              ? `\n${out.dim(
                  d.preview
                    .split("\n")
                    .map((l) => `│ ${l}`)
                    .join("\n"),
                )}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        nextSteps: rows.length ? [`event-ops credits send --from "${flags.from}" --subject "${flags.subject}" --confirm`] : [],
      }
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new CliError("missing-resend-api-key", "RESEND_API_KEY is not set", {
        exit: EXIT.precondition,
        hint: "Export it, or use `event-ops credits export` for a mail-merge CSV",
      })
    }

    let sent = 0
    const failed = []
    for (const [i, row] of rows.entries()) {
      progress(`sending ${i + 1}/${rows.length}…`)
      const codeRow = ledger.codes.find((c) => c.id === row.code_id)
      codeRow.sendPendingAt = new Date().toISOString()
      saveLedger(path, ledger)
      let response
      try {
        response = await fetch(process.env.EVENT_OPS_RESEND_URL || "https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "idempotency-key": `event-ops/${ledger.eventSlug}/${row.code_id}`,
          },
          body: JSON.stringify({
            from: flags.from,
            to: [row.delivery_email],
            subject: flags.subject,
            text: renderEmailText(template, row, ledger.eventSlug),
          }),
          signal: AbortSignal.timeout(15_000),
        })
      } catch (error) {
        progressDone()
        failed.push({ to: row.delivery_email, status: null, error: `network: ${error.message}`, unconfirmed: true })
        break
      }
      if (response.ok) {
        codeRow.sentAt = new Date().toISOString()
        delete codeRow.sendPendingAt
        sent++
      } else {
        delete codeRow.sendPendingAt
        failed.push({ to: row.delivery_email, status: response.status, error: (await response.text()).slice(0, 200) })
      }
      saveLedger(path, ledger)
      await new Promise((r) => setTimeout(r, 200))
    }
    progressDone()
    return {
      data: { dryRun: false, pending: rows.length, sent, failed, skippedPending },
      human: (d) =>
        [
          `${d.failed.length ? out.yellow("sent") : out.green("sent")} ${out.bold(d.sent)}/${d.pending}`,
          ...d.failed.map((f) => `  ${out.red(f.status ?? "net")} ${f.to}  ${out.dim(f.error)}`),
        ].join("\n"),
      nextSteps: failed.length
        ? ["event-ops credits status", "event-ops credits send … --confirm --retry-pending"]
        : ["event-ops credits status"],
      exit: failed.length ? EXIT.failure : EXIT.ok,
    }
  },
}
