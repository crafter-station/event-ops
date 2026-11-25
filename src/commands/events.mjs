import { existsSync } from "node:fs"
import { CliError, EXIT } from "../errors.mjs"
import { poolStats } from "../lib/ledger.mjs"
import { assertSlug, homeDir, ledgerPathFor, listEvents, loadLedger, readConfig, writeConfig } from "../lib/store.mjs"
import { out, table } from "../ui.mjs"

export const handlers = {
  "events list": async () => {
    const current = process.env.EVENT_OPS_EVENT || readConfig().currentEvent || null
    const events = listEvents().map((slug) => {
      const ledger = loadLedger(ledgerPathFor(slug))
      const pool = poolStats(ledger)
      return {
        slug,
        current: slug === current,
        guests: Object.keys(ledger.guests).length,
        codes: pool.total,
        assigned: pool.assigned,
        sent: pool.sent,
        updatedAt: ledger.updatedAt,
      }
    })
    return {
      data: { home: homeDir(), current, events },
      human: (d) =>
        d.events.length
          ? table(
              ["", "event", "guests", "codes", "assigned", "sent", "updated"],
              d.events.map((e) =>
                [
                  e.current ? out.accent("●") : " ",
                  e.current ? out.bold(e.slug) : e.slug,
                  e.guests,
                  e.codes,
                  e.assigned,
                  e.sent,
                  out.dim(e.updatedAt?.slice(0, 16).replace("T", " ") ?? ""),
                ].map(String),
              ),
            )
          : out.dim(`No events yet in ${d.home}`),
      nextSteps: events.length ? [] : ["event-ops credits init <event>"],
    }
  },

  "events use": async ({ positionals }) => {
    const slug = assertSlug(positionals[0])
    if (!existsSync(ledgerPathFor(slug))) {
      throw new CliError("event-not-found", `No event "${slug}"`, { exit: EXIT.precondition, hint: "Run `event-ops events list`" })
    }
    writeConfig({ ...readConfig(), currentEvent: slug })
    return {
      data: { current: slug },
      human: (d) => `${out.green("current event")} ${out.bold(d.current)}`,
      nextSteps: ["event-ops credits status"],
    }
  },
}
