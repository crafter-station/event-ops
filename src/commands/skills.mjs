import { existsSync, readdirSync, readFileSync } from "node:fs"
import { VERSION } from "../cli.mjs"
import { CliError, EXIT } from "../errors.mjs"
import { out, table } from "../ui.mjs"

const DIR = new URL("../../skill-data/", import.meta.url)

function parse(name) {
  const raw = readFileSync(new URL(`${name}.md`, DIR), "utf8")
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  const meta = {}
  if (match) {
    for (const line of match[1].split("\n")) {
      const i = line.indexOf(":")
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
  }
  return { name, summary: meta.summary ?? "", order: Number(meta.order ?? 99), body: match ? raw.slice(match[0].length) : raw }
}

function all() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parse(f.slice(0, -3)))
    .sort((a, b) => a.order - b.order)
}

export const handlers = {
  "skills list": async () => {
    const skills = all().map(({ name, summary }) => ({ name, summary }))
    return {
      data: { skills },
      human: (d) =>
        table(
          ["skill", "what it covers"],
          d.skills.map((s) => [out.accent(s.name), s.summary]),
        ),
      nextSteps: ["event-ops skills get core"],
    }
  },

  "skills get": async ({ positionals }) => {
    const name = positionals[0]
    if (!/^[a-z0-9-]+$/.test(name) || !existsSync(new URL(`${name}.md`, DIR))) {
      throw new CliError("skill-not-found", `No bundled skill "${name}"`, {
        exit: EXIT.precondition,
        hint: `Available: ${all()
          .map((s) => s.name)
          .join(", ")}`,
      })
    }
    const skill = parse(name)
    const markdown = `<!-- event-ops v${VERSION} · skill ${name} -->\n${skill.body}`
    return { markdown, data: { name, version: VERSION, content: skill.body } }
  },
}
