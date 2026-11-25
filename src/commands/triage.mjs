import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { CliError, EXIT } from "../errors.mjs"
import { enrichGuests } from "../lib/enrich.mjs"
import { atomicWrite } from "../lib/store.mjs"
import { heading, out, progress, progressDone, table } from "../ui.mjs"

function ghReady() {
  try {
    execFileSync("gh", ["auth", "status"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

export const handlers = {
  triage: async ({ positionals, flags }) => {
    const file = resolve(positionals[0])
    if (!existsSync(file)) throw new CliError("file-not-found", `File not found: ${positionals[0]}`, { exit: EXIT.precondition })
    const github = ghReady()
    if (!github)
      process.stderr.write(`${out.yellow("warn")} gh is missing or not authenticated: GitHub lookups are skipped (run \`gh auth login\`)\n`)
    const report = await enrichGuests(readFileSync(file, "utf8"), {
      status: flags.status,
      onProgress: (done, total) => progress(`enriching ${done}/${total}…`),
    })
    progressDone()
    const data = { ...report, githubLookups: github }
    if (flags.out) {
      const outPath = resolve(flags.out)
      atomicWrite(outPath, `${JSON.stringify(data, null, 2)}\n`)
      return {
        data: { outPath, total: data.total, enriched: data.guests.length, counts: data.counts, githubLookups: github },
        human: (d) => `${out.green("enriched")} ${out.bold(d.enriched)} of ${d.total} guests → ${d.outPath}`,
        nextSteps: ["event-ops skills get triage  # how to rank and decide"],
      }
    }
    return {
      data,
      human: (d) => {
        const rows = d.guests.map((g) => {
          const gh = g.github.find((x) => x.profile)?.profile
          return [
            g.name,
            g.status,
            gh ? `${gh.login} ${out.dim(`(${g.github[0].source})`)}` : out.dim("-"),
            g.links.length ? String(g.links.length) : out.dim("0"),
            g.flags.length ? out.yellow(g.flags.join(", ")) : "",
          ]
        })
        return [
          heading(`${d.guests.length} guests enriched`) +
            out.dim(
              `  of ${d.total} · ${Object.entries(d.counts)
                .map(([k, v]) => `${v} ${k}`)
                .join(", ")}`,
            ),
          "",
          table(["name", "status", "github", "links", "flags"], rows),
        ].join("\n")
      },
      nextSteps: ["event-ops skills get triage  # how to rank and decide"],
    }
  },
}
