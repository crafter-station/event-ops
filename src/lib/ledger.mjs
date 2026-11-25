export const VALID_GATES = new Set(["approved", "checked-in", "feedback"])

export function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, "")
  const rows = []
  let row = []
  let field = ""
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        quoted = false
      } else {
        field += c
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += c
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""))
}

export function parseCsvObjects(text) {
  const rows = parseCsv(text)
  if (rows.length === 0) return { headers: [], records: [] }
  const headers = rows[0].map((h) => h.trim())
  const records = rows.slice(1).map((r) => {
    const obj = {}
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = (r[i] ?? "").trim()
    }
    return obj
  })
  return { headers, records }
}

export function formatCsvCell(value) {
  const str = String(value ?? "")
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`
  return safe
}

export function formatCsv(headers, rows) {
  const lines = [headers.map(formatCsvCell).join(",")]
  for (const row of rows) {
    lines.push(headers.map((h) => formatCsvCell(row[h] ?? "")).join(","))
  }
  return `${lines.join("\n")}\n`
}

export function normalizeEmail(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (!s || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null
  return s
}

export function canonicalEmail(raw) {
  const norm = normalizeEmail(raw)
  if (!norm) return null
  const [localRaw, domainRaw] = norm.split("@")
  const domain = domainRaw === "googlemail.com" ? "gmail.com" : domainRaw
  let local = localRaw.split("+")[0]
  if (domain === "gmail.com") local = local.replace(/\./g, "")
  return `${local}@${domain}`
}

function normalizeName(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

export function parseRequireFlags(raw) {
  if (!raw) return ["checked-in"]
  const parts = String(raw)
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
  for (const p of parts) {
    if (!VALID_GATES.has(p)) {
      throw new Error(`Invalid --require gate "${p}". Valid: ${[...VALID_GATES].join(", ")}`)
    }
  }
  return [...new Set(parts)]
}

export function createLedger({ eventSlug, lumaEventId = null, require = ["checked-in"], deliveryTarget = "luma" } = {}) {
  if (!eventSlug) throw new Error("eventSlug is required")
  if (!["luma", "chatgpt"].includes(deliveryTarget)) {
    throw new Error(`Invalid --target "${deliveryTarget}". Valid: luma, chatgpt`)
  }
  const now = new Date().toISOString()
  return {
    version: 1,
    eventSlug,
    createdAt: now,
    updatedAt: now,
    config: {
      lumaEventId,
      require,
      deliveryTarget,
    },
    guests: {},
    codes: [],
  }
}

function detectChatgptColumn(headers, records) {
  const exact = headers.find((h) => /(chatgpt|openai)/i.test(h) && /(email|mail|correo)/i.test(h))
  if (exact) return exact
  const loose = headers.find((h) => /(chatgpt|openai)/i.test(h))
  if (loose && records.some((r) => normalizeEmail(r[loose]))) return loose
  return null
}

export function importLumaCsv(ledger, csvText, { chatgptCol } = {}) {
  const { headers, records } = parseCsvObjects(csvText)
  if (!headers.length) throw new Error("Empty Luma CSV")
  const emailCol = headers.find((h) => /^email$/i.test(h)) ?? headers.find((h) => /email/i.test(h))
  if (!emailCol) throw new Error("Could not find email column in Luma CSV")
  const detectedChatgptCol = chatgptCol ?? detectChatgptColumn(headers, records)

  let added = 0
  let updated = 0
  let skipped = 0

  for (const row of records) {
    const lumaEmail = normalizeEmail(row[emailCol])
    if (!lumaEmail) {
      skipped++
      continue
    }
    const existing = ledger.guests[lumaEmail]
    const chatgptEmail = detectedChatgptCol ? normalizeEmail(row[detectedChatgptCol]) : null
    const fullName = row.name || [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || lumaEmail.split("@")[0]
    const approvalStatus = (row.approval_status || "approved").toLowerCase()
    const checkedInAt = row.checked_in_at || null
    const rating = row.survey_response_rating || null
    const feedback = row.survey_response_feedback || null
    const hasLumaFeedback = Boolean(rating || feedback)

    if (existing) {
      existing.guestId = row.guest_id || existing.guestId
      existing.name = fullName || existing.name
      existing.approvalStatus = approvalStatus
      existing.kind = approvalStatus === "approved" ? "luma" : existing.kind
      if (chatgptEmail && !existing.chatgptEmail) {
        existing.chatgptEmail = chatgptEmail
        existing.canonicalChatgptEmail = canonicalEmail(chatgptEmail)
      }
      if (checkedInAt && !existing.checkedInAt) existing.checkedInAt = checkedInAt
      if (hasLumaFeedback && !existing.feedbackAt) {
        existing.feedbackAt = new Date().toISOString()
        existing.feedbackRating = rating || existing.feedbackRating
        existing.feedbackText = feedback || existing.feedbackText
      }
      updated++
    } else {
      ledger.guests[lumaEmail] = {
        id: lumaEmail,
        guestId: row.guest_id || null,
        lumaEmail,
        canonicalLumaEmail: canonicalEmail(lumaEmail),
        chatgptEmail,
        canonicalChatgptEmail: chatgptEmail ? canonicalEmail(chatgptEmail) : null,
        name: fullName,
        approvalStatus,
        kind: approvalStatus === "approved" ? "luma" : "waitlist",
        checkedInAt,
        feedbackAt: hasLumaFeedback ? new Date().toISOString() : null,
        feedbackRating: rating,
        feedbackText: feedback,
        createdAt: row.created_at || new Date().toISOString(),
      }
      added++
    }
  }

  return {
    added,
    updated,
    skipped,
    chatgptCol: detectedChatgptCol,
    totalGuests: Object.keys(ledger.guests).length,
  }
}

export function findGuestByEmail(ledger, rawEmail) {
  const norm = normalizeEmail(rawEmail)
  if (!norm) return null
  if (ledger.guests[norm]) return ledger.guests[norm]
  const canon = canonicalEmail(norm)
  for (const guest of Object.values(ledger.guests)) {
    if (guest.chatgptEmail === norm) return guest
    if (guest.canonicalLumaEmail === canon) return guest
    if (guest.canonicalChatgptEmail && guest.canonicalChatgptEmail === canon) return guest
  }
  return null
}

export function importFeedbackCsv(ledger, csvText, { emailCol, ratingCol, commentCol } = {}) {
  const { headers, records } = parseCsvObjects(csvText)
  if (!headers.length) throw new Error("Empty feedback CSV")
  const detectedEmailCol =
    emailCol ?? headers.find((h) => /(chatgpt|openai|luma).*mail/i.test(h)) ?? headers.find((h) => /(email|mail|correo)/i.test(h))
  if (!detectedEmailCol) throw new Error("Could not find email column in feedback CSV")
  const detectedRatingCol = ratingCol ?? headers.find((h) => /(rating|score|nps|stars|calific)/i.test(h))
  const detectedCommentCol = commentCol ?? headers.find((h) => /(feedback|comment|learn|takeaway|mejor|coment)/i.test(h))

  let matched = 0
  const unmatched = []
  for (const row of records) {
    const email = normalizeEmail(row[detectedEmailCol])
    if (!email) continue
    const guest = findGuestByEmail(ledger, email)
    if (!guest) {
      unmatched.push(email)
      continue
    }
    guest.feedbackAt = guest.feedbackAt || new Date().toISOString()
    if (detectedRatingCol && row[detectedRatingCol]) guest.feedbackRating = row[detectedRatingCol]
    if (detectedCommentCol && row[detectedCommentCol]) guest.feedbackText = row[detectedCommentCol]
    matched++
  }
  return { matched, unmatched, emailCol: detectedEmailCol }
}

const CODE_HEADER_RE = /^(code|coupon|coupon_code|credit_code|redemption_url|redemption_link|url|link|voucher|promo_code)$/i

export function importCreditsCsv(ledger, csvText, { codeCol, reserveCount = 0 } = {}) {
  const rows = parseCsv(csvText)
  if (!rows.length) throw new Error("Empty credits CSV")

  let extracted = []
  const firstRow = rows[0].map((c) => c.trim())
  const singleColNoHeader = firstRow.length === 1 && !CODE_HEADER_RE.test(firstRow[0])

  if (singleColNoHeader && !codeCol) {
    extracted = rows.map((r) => (r[0] ?? "").trim()).filter(Boolean)
  } else {
    const headers = firstRow
    let idx = codeCol ? headers.indexOf(codeCol) : headers.findIndex((h) => CODE_HEADER_RE.test(h))
    if (idx === -1) idx = 0
    extracted = rows
      .slice(1)
      .map((r) => (r[idx] ?? "").trim())
      .filter(Boolean)
  }

  const existingSet = new Set(ledger.codes.map((c) => c.code))
  const uniqueNew = [...new Set(extracted)].filter((c) => !existingSet.has(c))
  const totalNew = uniqueNew.length
  const effectiveReserve = Math.max(0, Math.min(Number(reserveCount) || 0, totalNew))
  const mainCount = totalNew - effectiveReserve

  let nextIdx = ledger.codes.length + 1
  for (let i = 0; i < uniqueNew.length; i++) {
    ledger.codes.push({
      id: `c_${String(nextIdx++).padStart(4, "0")}`,
      code: uniqueNew[i],
      reserve: i >= mainCount,
      status: "free",
      assignedTo: null,
      assignedAt: null,
      sentAt: null,
      burnedAt: null,
      burnReason: null,
    })
  }

  return {
    imported: totalNew,
    duplicatesIgnored: extracted.length - totalNew,
    mainAdded: mainCount,
    reserveAdded: effectiveReserve,
    pool: poolStats(ledger),
  }
}

export function poolStats(ledger) {
  let free = 0
  let reserve = 0
  let assigned = 0
  let sent = 0
  let sending = 0
  let burned = 0
  for (const c of ledger.codes) {
    if (c.status === "free") {
      if (c.reserve) reserve++
      else free++
    } else if (c.status === "assigned") {
      assigned++
      if (c.sentAt) sent++
      else if (c.sendPendingAt) sending++
    } else if (c.status === "burned") {
      burned++
    }
  }
  return { total: ledger.codes.length, free, reserve, assigned, sent, sending, burned }
}

export function getAssignedCode(ledger, guestId) {
  return ledger.codes.find((c) => c.assignedTo === guestId && c.status === "assigned") ?? null
}

export function isEligible(guest, requireGates) {
  for (const gate of requireGates) {
    if (gate === "approved" && guest.approvalStatus !== "approved") return false
    if (gate === "checked-in" && !guest.checkedInAt) return false
    if (gate === "feedback" && !guest.feedbackAt) return false
  }
  return true
}

export function deliveryEmailFor(guest, target = "luma") {
  if (target === "chatgpt" && guest.chatgptEmail) return guest.chatgptEmail
  return guest.lumaEmail
}

export function auditLedger(ledger) {
  const guests = Object.values(ledger.guests)
  const byCanonicalLuma = new Map()
  const byCanonicalChatgpt = new Map()
  const byName = new Map()

  for (const g of guests) {
    const cl = g.canonicalLumaEmail
    if (!byCanonicalLuma.has(cl)) byCanonicalLuma.set(cl, [])
    byCanonicalLuma.get(cl).push(g.lumaEmail)

    if (g.canonicalChatgptEmail) {
      const cc = g.canonicalChatgptEmail
      if (!byCanonicalChatgpt.has(cc)) byCanonicalChatgpt.set(cc, [])
      byCanonicalChatgpt.get(cc).push(g.lumaEmail)
    }

    const nn = normalizeName(g.name)
    if (nn && nn.length >= 4) {
      if (!byName.has(nn)) byName.set(nn, [])
      byName.get(nn).push(g.lumaEmail)
    }
  }

  const duplicateCanonicalEmails = [...byCanonicalLuma.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([canonical, emails]) => ({ canonical, emails }))

  const sharedChatgptEmails = [...byCanonicalChatgpt.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([canonicalChatgpt, lumaEmails]) => ({ canonicalChatgpt, lumaEmails }))

  const sameNameMultiEmails = [...byName.entries()].filter(([, list]) => list.length > 1).map(([name, emails]) => ({ name, emails }))

  const eligible = guests.filter((g) => isEligible(g, ledger.config.require))
  const missingChatgptEmail = eligible.filter((g) => !g.chatgptEmail).map((g) => g.lumaEmail)

  return {
    eventSlug: ledger.eventSlug,
    lumaEventId: ledger.config.lumaEventId,
    require: ledger.config.require,
    deliveryTarget: ledger.config.deliveryTarget,
    counts: {
      total: guests.length,
      approved: guests.filter((g) => g.approvalStatus === "approved").length,
      checkedIn: guests.filter((g) => Boolean(g.checkedInAt)).length,
      feedback: guests.filter((g) => Boolean(g.feedbackAt)).length,
      eligible: eligible.length,
    },
    pool: poolStats(ledger),
    flags: {
      duplicateCanonicalEmails,
      sharedChatgptEmails,
      sameNameMultiEmails,
      missingChatgptEmailCount: missingChatgptEmail.length,
    },
  }
}

function buildClaimedCanonicalSet(ledger) {
  const claimed = new Set()
  for (const c of ledger.codes) {
    if (c.status !== "assigned" || !c.assignedTo) continue
    const g = ledger.guests[c.assignedTo]
    if (!g) continue
    claimed.add(g.canonicalLumaEmail)
    if (g.canonicalChatgptEmail) claimed.add(g.canonicalChatgptEmail)
  }
  return claimed
}

export function assignCodes(ledger, { commit = false, includeReserve = false } = {}) {
  const claimedCanon = buildClaimedCanonicalSet(ledger)
  const candidates = Object.values(ledger.guests)
    .filter((g) => isEligible(g, ledger.config.require))
    .filter((g) => !getAssignedCode(ledger, g.id))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "luma" ? -1 : 1
      return (a.createdAt || "").localeCompare(b.createdAt || "")
    })

  const available = ledger.codes.filter((c) => c.status === "free" && (includeReserve || !c.reserve))
  const plan = []
  const blocked = []
  let poolIdx = 0

  for (const guest of candidates) {
    if (claimedCanon.has(guest.canonicalLumaEmail) || (guest.canonicalChatgptEmail && claimedCanon.has(guest.canonicalChatgptEmail))) {
      blocked.push({ email: guest.lumaEmail, reason: "duplicate-identity" })
      continue
    }
    if (poolIdx >= available.length) {
      blocked.push({ email: guest.lumaEmail, reason: "pool-exhausted" })
      continue
    }
    const codeRow = available[poolIdx++]
    claimedCanon.add(guest.canonicalLumaEmail)
    if (guest.canonicalChatgptEmail) claimedCanon.add(guest.canonicalChatgptEmail)

    plan.push({
      guestId: guest.id,
      name: guest.name,
      deliveryEmail: deliveryEmailFor(guest, ledger.config.deliveryTarget),
      codeId: codeRow.id,
      code: codeRow.code,
    })

    if (commit) {
      codeRow.status = "assigned"
      codeRow.assignedTo = guest.id
      codeRow.assignedAt = new Date().toISOString()
    }
  }

  return {
    committed: commit,
    assignedCount: plan.length,
    blocked,
    plan,
    poolAfter: poolStats(ledger),
  }
}

export function burnAndReplace(ledger, query, reason = "reported-broken") {
  const clean = String(query ?? "").trim()
  let codeRow = ledger.codes.find((c) => c.status === "assigned" && (c.code === clean || c.id === clean))
  if (!codeRow) {
    const guest = findGuestByEmail(ledger, clean)
    if (guest) codeRow = getAssignedCode(ledger, guest.id)
  }
  if (!codeRow) return { ok: false, error: "assigned-code-not-found" }

  const replacement =
    ledger.codes.find((c) => c.status === "free" && !c.reserve) ?? ledger.codes.find((c) => c.status === "free" && c.reserve)
  if (!replacement) return { ok: false, error: "no-replacement-available" }

  const now = new Date().toISOString()
  const guestId = codeRow.assignedTo
  codeRow.status = "burned"
  codeRow.burnedAt = now
  codeRow.burnReason = reason

  replacement.status = "assigned"
  replacement.assignedTo = guestId
  replacement.assignedAt = now

  return {
    ok: true,
    guestId,
    burnedCode: codeRow.code,
    newCode: replacement.code,
    usedReserve: replacement.reserve,
  }
}

export function exportDispatchRows(ledger, { onlyUnsent = true, markSent = false, includePending = false } = {}) {
  const now = new Date().toISOString()
  const rows = []
  for (const c of ledger.codes) {
    if (c.status !== "assigned" || !c.assignedTo) continue
    if (onlyUnsent && c.sentAt) continue
    if (onlyUnsent && c.sendPendingAt && !includePending) continue
    const g = ledger.guests[c.assignedTo]
    if (!g) continue
    rows.push({
      delivery_email: deliveryEmailFor(g, ledger.config.deliveryTarget),
      luma_email: g.lumaEmail,
      chatgpt_email: g.chatgptEmail || "",
      name: g.name,
      code: c.code,
      code_id: c.id,
    })
    if (markSent) c.sentAt = now
  }
  return rows
}
