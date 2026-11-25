import { canonicalEmail, normalizeEmail } from "./ledger.mjs"

export const LUMA_PUBLIC_API_BASE = "https://public-api.luma.com/v1"

function extractChatgptFromAnswers(answers) {
  if (!Array.isArray(answers)) return null
  for (const item of answers) {
    const label = String(item?.label ?? item?.question ?? "")
    const rawVal = item?.answer ?? item?.value ?? ""
    if (/(chatgpt|openai)/i.test(label)) {
      const email = normalizeEmail(rawVal)
      if (email) return email
    }
  }
  return null
}

function normalizeLumaGuestPayload(raw) {
  const g = raw?.guest ?? raw
  if (!g) return null
  const lumaEmail = normalizeEmail(g.user_email ?? g.email)
  if (!lumaEmail) return null
  const ticketCheckedIn = Array.isArray(g.event_tickets) ? (g.event_tickets.find((t) => t?.checked_in_at)?.checked_in_at ?? null) : null
  const checkedInAt = g.checked_in_at || ticketCheckedIn || null
  const chatgptEmail = extractChatgptFromAnswers(g.registration_answers)
  return {
    guestId: g.api_id || raw?.api_id || null,
    lumaEmail,
    name: g.user_name || g.name || [g.user_first_name, g.user_last_name].filter(Boolean).join(" ").trim() || lumaEmail.split("@")[0],
    approvalStatus: String(g.approval_status || "approved").toLowerCase(),
    checkedInAt,
    chatgptEmail,
    createdAt: g.registered_at || g.created_at || new Date().toISOString(),
  }
}

export function upsertNormalizedGuest(ledger, norm) {
  const existing = ledger.guests[norm.lumaEmail]
  if (existing) {
    existing.guestId = norm.guestId || existing.guestId
    existing.name = norm.name || existing.name
    existing.approvalStatus = norm.approvalStatus
    existing.kind = norm.approvalStatus === "approved" ? "luma" : existing.kind
    if (norm.chatgptEmail && !existing.chatgptEmail) {
      existing.chatgptEmail = norm.chatgptEmail
      existing.canonicalChatgptEmail = canonicalEmail(norm.chatgptEmail)
    }
    if (norm.checkedInAt && !existing.checkedInAt) existing.checkedInAt = norm.checkedInAt
    return "updated"
  }
  ledger.guests[norm.lumaEmail] = {
    id: norm.lumaEmail,
    guestId: norm.guestId,
    lumaEmail: norm.lumaEmail,
    canonicalLumaEmail: canonicalEmail(norm.lumaEmail),
    chatgptEmail: norm.chatgptEmail,
    canonicalChatgptEmail: norm.chatgptEmail ? canonicalEmail(norm.chatgptEmail) : null,
    name: norm.name,
    approvalStatus: norm.approvalStatus,
    kind: norm.approvalStatus === "approved" ? "luma" : "waitlist",
    checkedInAt: norm.checkedInAt,
    feedbackAt: null,
    feedbackRating: null,
    feedbackText: null,
    createdAt: norm.createdAt,
  }
  return "added"
}

export async function syncLumaEventGuests(ledger, { apiKey, eventId, apiBase = LUMA_PUBLIC_API_BASE, fetchImpl = fetch } = {}) {
  if (!apiKey) {
    return {
      ok: false,
      fallback: "csv",
      error: "missing-luma-api-key",
      message: "LUMA_API_KEY is not set. Run `event-ops credits sync --csv <guests.csv>` with a Luma Guests export instead.",
    }
  }
  const targetEventId = eventId || ledger.config.lumaEventId
  if (!targetEventId) {
    return {
      ok: false,
      error: "missing-event-id",
      message: "Pass --luma-event-id evt-... to `event-ops credits sync` or `event-ops credits init`.",
    }
  }

  let cursor = null
  let pages = 0
  let added = 0
  let updated = 0
  let skipped = 0

  do {
    const url = new URL(`${apiBase}/event/get-guests`)
    url.searchParams.set("event_api_id", targetEventId)
    url.searchParams.set("pagination_limit", "100")
    if (cursor) url.searchParams.set("pagination_cursor", cursor)

    const res = await fetchImpl(url.toString(), {
      headers: {
        accept: "application/json",
        "x-luma-api-key": apiKey,
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      throw new Error(`Luma API get-guests failed (${res.status})`)
    }
    const data = await res.json()
    const entries = Array.isArray(data.entries) ? data.entries : []
    pages++
    for (const entry of entries) {
      const norm = normalizeLumaGuestPayload(entry)
      if (!norm) {
        skipped++
        continue
      }
      const outcome = upsertNormalizedGuest(ledger, norm)
      if (outcome === "added") added++
      else updated++
    }
    cursor = data.has_more && data.next_cursor ? data.next_cursor : null
  } while (cursor)

  ledger.config.lumaEventId = targetEventId
  return {
    ok: true,
    source: "luma-api",
    eventId: targetEventId,
    pages,
    added,
    updated,
    skipped,
    totalGuests: Object.keys(ledger.guests).length,
  }
}
