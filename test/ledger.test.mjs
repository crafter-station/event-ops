import assert from "node:assert/strict"
import { test } from "node:test"
import {
  assignCodes,
  auditLedger,
  burnAndReplace,
  canonicalEmail,
  createLedger,
  exportDispatchRows,
  formatCsv,
  importCreditsCsv,
  importFeedbackCsv,
  importLumaCsv,
} from "../src/lib/ledger.mjs"
import { syncLumaEventGuests } from "../src/lib/luma-api.mjs"

test("canonicalEmail normalizes Gmail dots and +tags without altering delivery address", () => {
  assert.equal(canonicalEmail("A.L.I.C.E+codex@gmail.com"), "alice@gmail.com")
  assert.equal(canonicalEmail("alice+2@googlemail.com"), "alice@gmail.com")
  assert.equal(canonicalEmail("bob+event@company.dev"), "bob@company.dev")
  assert.equal(canonicalEmail("not-an-email"), null)
})

test("Luma + Feedback + Credits end-to-end blocks Gmail aliases, shared ChatGPT emails, and handles reserve burn/replace", () => {
  const ledger = createLedger({
    eventSlug: "codex-lima",
    require: ["checked-in", "feedback"],
    deliveryTarget: "luma",
  })

  const lumaCsv = [
    "guest_id,name,email,approval_status,checked_in_at,What is your ChatGPT email?,survey_response_rating",
    "gst-1,Alice Dev,alice@gmail.com,approved,2026-10-21T19:00:00Z,alice.chatgpt@gmail.com,5",
    "gst-2,Alice Alias,a.l.i.c.e+dup@gmail.com,approved,2026-10-21T19:01:00Z,other@gmail.com,5",
    "gst-3,Bob Builder,bob@company.dev,approved,2026-10-21T19:02:00Z,bob.openai@gmail.com,",
    "gst-4,Bob Alt,bob2@company.dev,approved,2026-10-21T19:03:00Z,bob.openai@gmail.com,5",
    "gst-5,No Show,noshow@example.com,approved,,noshow@example.com,5",
  ].join("\n")

  const lumaRes = importLumaCsv(ledger, lumaCsv)
  assert.equal(lumaRes.added, 5)
  assert.equal(lumaRes.chatgptCol, "What is your ChatGPT email?")

  const feedbackCsv = [
    "Timestamp,Your Email,Rating,Comments",
    "2026-10-21T21:00:00Z,bob.openai@gmail.com,5,Loved the live Codex demo",
  ].join("\n")
  const fbRes = importFeedbackCsv(ledger, feedbackCsv)
  assert.equal(fbRes.matched, 1)

  // Headerless 1-column credits CSV with 1 reserve code
  const creditsCsv = ["OAI-CODE-001", "OAI-CODE-002", "OAI-CODE-003", "OAI-CODE-001"].join("\n")
  const credRes = importCreditsCsv(ledger, creditsCsv, { reserveCount: 1 })
  assert.equal(credRes.imported, 3)
  assert.equal(credRes.duplicatesIgnored, 1)
  assert.equal(credRes.mainAdded, 2)
  assert.equal(credRes.reserveAdded, 1)

  const audit = auditLedger(ledger)
  assert.equal(audit.flags.duplicateCanonicalEmails.length, 1)
  assert.equal(audit.flags.sharedChatgptEmails.length, 1)

  // Dry run does not mutate
  const dry = assignCodes(ledger, { commit: false })
  assert.equal(dry.assignedCount, 2)
  assert.equal(dry.blocked.length, 2)
  assert.equal(ledger.codes.filter((c) => c.status === "assigned").length, 0)

  // Commit assigns exactly 2 (Alice + Bob), blocking Alice Alias and Bob Alt
  const committed = assignCodes(ledger, { commit: true })
  assert.equal(committed.assignedCount, 2)
  assert.equal(committed.blocked.filter((b) => b.reason === "duplicate-identity").length, 2)

  // Re-running assign is idempotent
  const rerun = assignCodes(ledger, { commit: true })
  assert.equal(rerun.assignedCount, 0)

  // Default delivery target is verified Luma email
  const rows = exportDispatchRows(ledger, { onlyUnsent: true, markSent: true })
  assert.equal(rows.length, 2)
  assert.equal(rows.find((r) => r.luma_email === "alice@gmail.com").delivery_email, "alice@gmail.com")
  assert.equal(exportDispatchRows(ledger, { onlyUnsent: true }).length, 0)

  // Burn & replace pulls from reserve pool
  const burned = burnAndReplace(ledger, "alice@gmail.com", "already-redeemed")
  assert.equal(burned.ok, true)
  assert.equal(burned.usedReserve, true)
  assert.notEqual(burned.burnedCode, burned.newCode)

  // No replacement left -> refuses to burn
  const burnedAgain = burnAndReplace(ledger, "bob@company.dev", "broken")
  assert.equal(burnedAgain.ok, false)
  assert.equal(burnedAgain.error, "no-replacement-available")

  // CSV formula neutralization
  const safeCsv = formatCsv(["name", "code"], [{ name: "=CMD()", code: "OAI-1" }])
  assert.ok(safeCsv.includes("'=CMD()"))
})

test("Re-importing Luma CSV preserves existing ChatGPT email and never overwrites check-ins", () => {
  const ledger = createLedger({ eventSlug: "idempotent-test", require: ["checked-in"], deliveryTarget: "chatgpt" })
  importLumaCsv(
    ledger,
    [
      "guest_id,name,email,approval_status,checked_in_at,ChatGPT Email",
      "gst-1,Ana,ana@gmail.com,approved,2026-10-21T19:00:00Z,ana.original@gmail.com",
    ].join("\n"),
  )
  importLumaCsv(
    ledger,
    ["guest_id,name,email,approval_status,checked_in_at,ChatGPT Email", "gst-1,Ana,ana@gmail.com,approved,,attacker@evil.com"].join("\n"),
  )
  assert.equal(ledger.guests["ana@gmail.com"].chatgptEmail, "ana.original@gmail.com")
  assert.equal(ledger.guests["ana@gmail.com"].checkedInAt, "2026-10-21T19:00:00Z")
})

test("Luma API sync (with token) paginates guests, extracts ChatGPT email, and falls back cleanly without token", async () => {
  const ledger = createLedger({ eventSlug: "luma-api-test", lumaEventId: "evt-123" })

  const noToken = await syncLumaEventGuests(ledger, { apiKey: "" })
  assert.equal(noToken.ok, false)
  assert.equal(noToken.fallback, "csv")

  const calls = []
  const mockFetch = async (urlStr) => {
    calls.push(urlStr)
    const u = new URL(urlStr)
    const cursor = u.searchParams.get("pagination_cursor")
    if (!cursor) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          entries: [
            {
              api_id: "gst-api-1",
              guest: {
                api_id: "gst-api-1",
                user_email: "diego@example.com",
                user_name: "Diego Dev",
                approval_status: "approved",
                checked_in_at: "2026-10-21T19:00:00Z",
                registration_answers: [{ label: "Your ChatGPT Email", answer: "diego.oai@gmail.com" }],
              },
            },
          ],
          has_more: true,
          next_cursor: "cur-2",
        }),
      }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        entries: [
          {
            api_id: "gst-api-2",
            guest: {
              api_id: "gst-api-2",
              user_email: "elena@example.com",
              user_name: "Elena Eng",
              approval_status: "approved",
              event_tickets: [{ checked_in_at: "2026-10-21T19:05:00Z" }],
            },
          },
        ],
        has_more: false,
        next_cursor: null,
      }),
    }
  }

  const synced = await syncLumaEventGuests(ledger, { apiKey: "luma-secret", fetchImpl: mockFetch })
  assert.equal(synced.ok, true)
  assert.equal(synced.pages, 2)
  assert.equal(synced.added, 2)
  assert.equal(ledger.guests["diego@example.com"].chatgptEmail, "diego.oai@gmail.com")
  assert.equal(Boolean(ledger.guests["elena@example.com"].checkedInAt), true)
  assert.equal(calls.length, 2)
})
