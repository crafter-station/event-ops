import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, test } from "node:test"
import { fileURLToPath } from "node:url"

const BIN = fileURLToPath(new URL("../bin/event-ops.mjs", import.meta.url))
const HOME = mkdtempSync(join(tmpdir(), "event-ops-send-"))
const requests = []
let mode = "ok-then-reject"
let server
let url

before(async () => {
  server = createServer((req, res) => {
    let body = ""
    req.on("data", (c) => {
      body += c
    })
    req.on("end", () => {
      requests.push({ headers: req.headers, body: JSON.parse(body) })
      if (mode === "drop") return req.socket.destroy()
      if (mode === "ok-then-reject" && requests.length === 2) {
        res.writeHead(422, { "content-type": "application/json" })
        return res.end('{"message":"invalid to"}')
      }
      res.writeHead(200, { "content-type": "application/json" })
      res.end('{"id":"re_test"}')
    })
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  url = `http://127.0.0.1:${server.address().port}/emails`
})

after(() => {
  server.close()
  rmSync(HOME, { recursive: true, force: true })
})

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: { ...process.env, EVENT_OPS_HOME: HOME, EVENT_OPS_RESEND_URL: url, RESEND_API_KEY: "re_fake", LUMA_API_KEY: "" },
    })
    let stdout = ""
    child.stdout.on("data", (c) => {
      stdout += c
    })
    child.on("close", (code) => resolve({ code, json: () => JSON.parse(stdout) }))
  })
}

test("send confirms per code, uses idempotency keys, and never re-sends unconfirmed codes silently", async () => {
  const guests = join(HOME, "g.csv")
  writeFileSync(
    guests,
    [
      "name,email,approval_status,checked_in_at",
      "A,a@x.dev,approved,2026-12-12T19:00:00Z",
      "B,b@x.dev,approved,2026-12-12T19:00:00Z",
      "C,c@x.dev,approved,2026-12-12T19:00:00Z",
    ].join("\n"),
  )
  const codes = join(HOME, "c.csv")
  writeFileSync(codes, "K1\nK2\nK3\n")
  await run(["credits", "init", "send-test"])
  await run(["credits", "sync", "--csv", guests])
  await run(["credits", "import", "codes", codes])
  await run(["credits", "assign", "--commit"])

  mode = "ok-then-reject"
  const first = await run(["credits", "send", "--from", "H <h@x.dev>", "--subject", "S", "--confirm"])
  assert.equal(first.code, 1)
  const d1 = first.json().data
  assert.equal(d1.sent, 2)
  assert.equal(d1.failed.length, 1)
  assert.equal(d1.failed[0].status, 422)
  assert.match(requests[0].headers["idempotency-key"], /^event-ops\/send-test\/c_\d{4}$/)
  assert.ok(requests[0].body.text.includes("K"))

  const status1 = (await run(["credits", "status"])).json().data.pool
  assert.equal(status1.sent, 2)
  assert.equal(status1.sending, 0, "a definite rejection clears the pending marker")

  mode = "drop"
  const second = await run(["credits", "send", "--from", "H <h@x.dev>", "--subject", "S", "--confirm"])
  assert.equal(second.code, 1)
  assert.equal(second.json().data.failed[0].unconfirmed, true)
  assert.equal((await run(["credits", "status"])).json().data.pool.sending, 1)

  const before = requests.length
  const third = await run(["credits", "send", "--from", "H <h@x.dev>", "--subject", "S", "--confirm"])
  assert.equal(third.json().data.skippedPending, 1)
  assert.equal(requests.length, before, "unconfirmed code is not re-sent without --retry-pending")

  mode = "ok"
  const retry = await run(["credits", "send", "--from", "H <h@x.dev>", "--subject", "S", "--confirm", "--retry-pending"])
  assert.equal(retry.code, 0)
  assert.equal(retry.json().data.sent, 1)
  const last = requests.at(-1)
  const prev = requests.at(-2)
  assert.equal(last.headers["idempotency-key"], prev.headers["idempotency-key"], "retry reuses the same idempotency key")
  assert.equal((await run(["credits", "status"])).json().data.pool.sent, 3)
})
