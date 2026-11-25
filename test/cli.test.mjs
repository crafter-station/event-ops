import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"

const BIN = fileURLToPath(new URL("../bin/event-ops.mjs", import.meta.url))
const HOME = mkdtempSync(join(tmpdir(), "event-ops-test-"))
after(() => rmSync(HOME, { recursive: true, force: true }))

function run(args, env = {}) {
  const res = spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    env: { ...process.env, EVENT_OPS_HOME: HOME, LUMA_API_KEY: "", RESEND_API_KEY: "", EVENT_OPS_EVENT: "", FORCE_COLOR: "", ...env },
  })
  return { code: res.status, stdout: res.stdout, stderr: res.stderr, json: () => JSON.parse(res.stdout) }
}

function file(name, content) {
  const p = join(HOME, name)
  writeFileSync(p, content)
  return p
}

test("piped output is a JSON envelope without ANSI escapes", () => {
  const r = run(["demo"])
  assert.equal(r.code, 0)
  assert.equal(r.stdout.includes("\u001b["), false)
  const env = r.json()
  assert.equal(env.ok, true)
  assert.equal(env.command, "demo")
  assert.equal(env.data.assigned.count, 2)
  assert.ok(Array.isArray(env.nextSteps))
})

test("schema exposes a version and every command", () => {
  const { data } = run(["schema"]).json()
  assert.equal(data.schemaVersion, 1)
  assert.match(data.version, /^\d+\.\d+\.\d+/)
  for (const name of ["credits init", "credits send", "triage", "skills get", "events use"]) {
    assert.ok(
      data.commands.some((c) => c.name === name),
      name,
    )
  }
  assert.equal(data.commands.find((c) => c.name === "credits send").risk, "external")
})

test("skills get prints markdown even when piped, json only on request", () => {
  const md = run(["skills", "get", "core"])
  assert.equal(md.code, 0)
  assert.match(md.stdout, /^<!-- event-ops v/)
  assert.match(md.stdout, /# event-ops: core guide/)
  const j = run(["skills", "get", "credits", "--json"]).json()
  assert.equal(j.data.name, "credits")
  const missing = run(["skills", "get", "nope"])
  assert.equal(missing.code, 3)
  assert.equal(missing.json().error.code, "skill-not-found")
})

test("usage errors exit 2, preconditions exit 3", () => {
  assert.equal(run(["credits", "nope"]).code, 2)
  assert.equal(run(["credits", "status", "--bogus"]).code, 2)
  assert.equal(run(["credits", "init"]).code, 2)
  const noEvent = run(["credits", "status"])
  assert.equal(noEvent.code, 3)
  assert.equal(noEvent.json().error.code, "no-event")
})

test("full credit flow through the binary", () => {
  const init = run(["credits", "init", "lima-test", "--require", "checked-in"])
  assert.equal(init.code, 0, init.stdout)
  const ledgerPath = init.json().data.ledgerPath
  assert.equal(statSync(ledgerPath).mode & 0o777, 0o600)

  assert.equal(run(["credits", "init", "lima-test"]).code, 3)

  const guests = file(
    "guests.csv",
    [
      "guest_id,name,email,approval_status,checked_in_at,ChatGPT email",
      "g1,Ana,ana@gmail.com,approved,2026-12-12T19:00:00Z,ana.ai@gmail.com",
      "g2,Ana Alt,a.n.a+x@gmail.com,approved,2026-12-12T19:01:00Z,",
      "g3,Beto,beto@dev.pe,approved,2026-12-12T19:02:00Z,beto@dev.pe",
      "g4,Ghost,ghost@dev.pe,approved,,ghost@dev.pe",
    ].join("\n"),
  )
  const sync = run(["credits", "sync", "--csv", guests]).json()
  assert.equal(sync.data.source, "csv")
  assert.equal(sync.data.added, 4)

  const noKey = run(["credits", "sync"])
  assert.equal(noKey.code, 3)
  assert.equal(noKey.json().error.code, "missing-luma-api-key")

  run(["credits", "import", "codes", file("codes.csv", "C1\nC2\nC3\n"), "--reserve", "1"])

  const status = run(["credits", "status"]).json().data
  assert.equal(status.counts.eligible, 3)
  assert.equal(status.flags.duplicateCanonicalEmails.length, 1)

  const dry = run(["credits", "assign"]).json().data
  assert.equal(dry.committed, false)
  assert.equal(run(["credits", "status"]).json().data.pool.assigned, 0)

  const commit = run(["credits", "assign", "--commit"]).json().data
  assert.equal(commit.assignedCount, 2)
  assert.ok(commit.blocked.some((b) => b.reason === "duplicate-identity"))
  assert.equal(JSON.stringify(commit).includes("C1"), false, "codes never leak into assign output")

  const burn = run(["credits", "burn", "ana@gmail.com"]).json().data
  assert.equal(burn.usedReserve, true)

  const sendDry = run(["credits", "send", "--from", "Host <h@x.dev>", "--subject", "Hi"]).json().data
  assert.equal(sendDry.dryRun, true)
  assert.equal(sendDry.pending, 2)
  const sendNoKey = run(["credits", "send", "--from", "Host <h@x.dev>", "--subject", "Hi", "--confirm"])
  assert.equal(sendNoKey.code, 3)

  const outPath = join(HOME, "dispatch.csv")
  const exp = run(["credits", "export", "--out", outPath, "--mark-sent"]).json().data
  assert.equal(exp.exported, 2)
  assert.match(readFileSync(outPath, "utf8"), /^delivery_email,luma_email,chatgpt_email,name,code/)
  assert.equal(run(["credits", "status"]).json().data.pool.sent, 2)

  const list = run(["events", "list"]).json().data
  assert.equal(list.current, "lima-test")
  assert.equal(list.events[0].sent, 2)
})
