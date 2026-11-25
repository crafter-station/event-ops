import * as L from "./ledger.mjs"

const UI_SDK = "https://ui-sdk.dev/web@0.1.0-beta.17"
const EVENT = "codex-lima-demo"
const EVENT_NAME = "Codex Lima"
const LUMA_EVENT_ID = "evt_demo0000"
const CHATGPT_HEADER = "What email do you use for ChatGPT?"
const DISPATCH_HEADERS = ["delivery_email", "luma_email", "chatgpt_email", "name", "code"]
const MAIL_FROM = "Codex Lima <hello@codexlima.dev>"
const MAIL_SUBJECT = "Your Codex credits"
const GATE_ORDER = ["approved", "checked-in", "feedback"]
const DEFAULTS = { require: ["approved", "checked-in"], target: "luma", poolSize: 8, reserve: 2 }
const STATIC_TAGS = ["ui-collapsible", "ui-checkbox-group", "ui-select", "ui-segmented-control"]
const WIDE = "(min-width: 1100px)"
const STEPS = ["The guest list", "Event night", "Give out codes", "A code doesn't work", "Send"]
const promptFor = (install, skills) =>
  [
    `Install the event-ops CLI with \`${install}\` and its agent skill with \`${skills}\`. Run \`event-ops skills get core\` and follow it.`,
    "",
    "Help me give out credit codes for my Luma event. Start with `event-ops demo` so I can see the flow. Then ask me for my event name, Luma event id and the codes CSV. Show me every dry run and wait for my OK before you commit or send any email.",
  ].join("\n")

const PM = {
  npm: {
    install: "npm i -g github:crafter-station/event-ops",
    skills: "npx skills add crafter-station/event-ops",
    demo: "event-ops demo",
  },
  bun: {
    install: "bun add -g github:crafter-station/event-ops",
    skills: "bunx skills add crafter-station/event-ops",
    demo: "event-ops demo",
  },
}
for (const pm of Object.values(PM)) pm.prompt = promptFor(pm.install, pm.skills)

const SEED = [
  {
    name: "Ana Torres",
    email: "ana.torres@gmail.com",
    chatgpt: "ana.torres@gmail.com",
    status: "approved",
    createdAt: "2026-11-02T14:10:00Z",
    checkedIn: "2026-11-20T19:02:00Z",
    feedback: true,
  },
  {
    name: "Bruno Diaz",
    email: "bruno@lattice.dev",
    chatgpt: "team@lattice.dev",
    status: "approved",
    createdAt: "2026-11-02T15:30:00Z",
    checkedIn: "2026-11-20T19:04:00Z",
    feedback: true,
  },
  {
    name: "Carla Reyes",
    email: "carla@lattice.dev",
    chatgpt: "team@lattice.dev",
    status: "approved",
    createdAt: "2026-11-03T09:12:00Z",
    checkedIn: "2026-11-20T19:05:00Z",
    feedback: true,
  },
  {
    name: "Diego Salas",
    email: "diego.salas@example.com",
    chatgpt: "diego.salas@example.com",
    status: "approved",
    createdAt: "2026-11-03T11:40:00Z",
    checkedIn: null,
    feedback: false,
  },
  {
    name: "Elena Ruiz",
    email: "elena@buildclub.io",
    chatgpt: "elena.ruiz@gmail.com",
    status: "approved",
    createdAt: "2026-11-04T08:05:00Z",
    checkedIn: "2026-11-20T19:11:00Z",
    feedback: false,
  },
  {
    name: "Gabriela Mena",
    email: "gabi@studio.pe",
    chatgpt: "gabi@studio.pe",
    status: "approved",
    createdAt: "2026-11-05T17:22:00Z",
    checkedIn: "2026-11-20T19:15:00Z",
    feedback: true,
  },
  {
    name: "Hugo Paredes",
    email: "hugo.paredes@outlook.com",
    chatgpt: "hugo.codes@gmail.com",
    status: "approved",
    createdAt: "2026-11-06T10:48:00Z",
    checkedIn: null,
    feedback: true,
    feedbackVia: "hugo.codes@gmail.com",
  },
  {
    name: "Isabel Vega",
    email: "isa.vega@proton.me",
    chatgpt: "",
    status: "approved",
    createdAt: "2026-11-07T21:03:00Z",
    checkedIn: "2026-11-20T19:22:00Z",
    feedback: true,
  },
  {
    name: "A. Torres",
    email: "a.n.a.torres+codex@gmail.com",
    chatgpt: "",
    status: "approved",
    createdAt: "2026-11-12T13:30:00Z",
    checkedIn: "2026-11-20T19:30:00Z",
    feedback: true,
  },
  {
    name: "Fabio Quispe",
    email: "fabio.q@hey.com",
    chatgpt: "fabio.q@hey.com",
    status: "waitlist",
    createdAt: "2026-11-14T16:55:00Z",
    checkedIn: "2026-11-20T19:40:00Z",
    feedback: true,
  },
]

const OUTCOME = {
  code: { tone: "ok" },
  "dup-email": { tone: "bad", label: "Same person, second email" },
  "shared-chatgpt": { tone: "bad", label: "Shares a ChatGPT account" },
  "no-show": { tone: "muted", label: "Didn't show up" },
  waitlist: { tone: "muted", label: "On the waitlist" },
  "no-feedback": { tone: "muted", label: "No feedback yet" },
  "out-of-codes": { tone: "warn", label: "Out of codes" },
  pending: { tone: "muted", label: "Qualifies" },
}

const freshArrivals = () => new Map(SEED.filter((s) => s.checkedIn).map((s) => [s.email, s.checkedIn]))

const state = {
  config: { ...DEFAULTS, require: [...DEFAULTS.require] },
  arrivals: freshArrivals(),
  ledger: null,
  step: 1,
  maxStep: 1,
  assign: null,
  burn: null,
  pick: null,
  sent: null,
  lastSync: null,
  setup: [],
  animate: false,
  pm: "npm",
}
const $ = (id) => document.getElementById(id)
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
let toast = null

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue
    if (k === "class") el.className = v
    else if (k === "text") el.textContent = v
    else if (k === "style") el.style.cssText = v
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v)
    else el.setAttribute(k, v === true ? "" : v)
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue
    el.append(kid instanceof Node ? kid : String(kid))
  }
  return el
}

function tk(frag, cls, text) {
  if (!text) return
  if (!cls) frag.append(document.createTextNode(text))
  else frag.append(h("span", { class: cls, text }))
}

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g
const RED_KEYS = new Set(["reason", "burnReason", "burnedCode"])
const GREEN_KEYS = new Set(["code", "newCode"])

function hlJson(value, { error = false } = {}) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  const frag = document.createDocumentFragment()
  let last = 0
  let key = null
  for (const m of text.matchAll(JSON_TOKEN)) {
    tk(frag, null, text.slice(last, m.index))
    last = m.index + m[0].length
    const [, str, colon, num, lit, punc] = m
    if (str && colon) {
      key = JSON.parse(str)
      tk(frag, "tk-key", str)
      tk(frag, "tk-punc", colon)
    } else if (str) {
      let cls = "tk-str"
      if (RED_KEYS.has(key) || (error && key === "code")) cls = "tk-bad"
      else if (GREEN_KEYS.has(key)) cls = "tk-ok"
      tk(frag, cls, str)
    } else if (num) tk(frag, "tk-num", num)
    else if (lit) {
      let cls = lit === "null" ? "tk-null" : "tk-bool"
      if (key === "ok") cls = lit === "true" ? "tk-ok" : "tk-bad"
      tk(frag, cls, lit)
    } else if (punc) {
      tk(frag, "tk-punc", punc)
      key = null
    }
  }
  tk(frag, null, text.slice(last))
  return frag
}

const SHELL_TOKEN = /(\s+)|(#.*$)|("[^"]*")|([[\]])|([^\s[\]"]+)/gm
const BINARIES = new Set(["event-ops", "npm", "npx", "bun", "bunx"])

function hlShell(text) {
  const frag = document.createDocumentFragment()
  let first = true
  let sawFlag = false
  let chain = false
  for (const m of text.matchAll(SHELL_TOKEN)) {
    const [whole, space, comment, quoted, bracket, word] = m
    if (space) tk(frag, null, space)
    else if (comment) tk(frag, "tk-com", comment)
    else if (quoted) tk(frag, "tk-str", quoted)
    else if (bracket) tk(frag, "tk-punc", bracket)
    else if (word) {
      let cls
      if (first && word === "$") cls = "tk-prompt"
      else if (first && BINARIES.has(word)) {
        cls = "tk-bin"
        chain = true
      } else if (/^--?[a-z]/i.test(word)) {
        cls = "tk-flag"
        sawFlag = true
      } else if (/^<[^>]+>$/.test(word)) cls = "tk-ph"
      else if (/^-?\d+$/.test(word) || word === "N") cls = "tk-num"
      else if (!sawFlag && (first || chain) && /^[a-z][a-z|-]*$/.test(word)) {
        cls = "tk-sub"
        chain = true
      } else cls = "tk-arg"
      if (cls === "tk-arg" || cls === "tk-ph") chain = false
      if (!(first && word === "$")) first = false
      tk(frag, cls, word)
    } else tk(frag, null, whole)
  }
  return frag
}

function splitCsvLine(line) {
  const cells = []
  const re = /("(?:[^"]|"")*"|[^,]*)(,|$)/g
  for (const m of line.matchAll(re)) {
    cells.push({ text: m[1], comma: m[2] })
    if (!m[2]) break
  }
  return cells
}

function hlCsv(text) {
  const frag = document.createDocumentFragment()
  text.split("\n").forEach((line, row) => {
    if (row > 0) frag.append(document.createTextNode("\n"))
    if (!line) return
    const cells = splitCsvLine(line)
    cells.forEach((cell, col) => {
      const last = col === cells.length - 1
      tk(frag, row === 0 ? "csv-head" : last ? "csv-code" : `csv-c${col % 2}`, cell.text)
      tk(frag, "tk-punc", cell.comma)
    })
  })
  return frag
}

function notify(type, title, options = {}) {
  if (!toast) return
  toast.dismiss?.()
  const fn = type === "default" ? toast : toast[type]
  fn(title, options)
}

function setProp(el, tag, prop, value, attr = prop) {
  if (customElements.get(tag)) {
    if (el[prop] !== value) el[prop] = value
  } else if (typeof value === "boolean") el.toggleAttribute(attr, value)
  else el.setAttribute(attr, String(value))
}

function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

function firstName(name) {
  return name.split(" ")[0]
}

function guestsCsv() {
  const headers = ["guest_id", "name", "email", "approval_status", "checked_in_at", "created_at", CHATGPT_HEADER]
  const rows = SEED.map((s, i) => ({
    guest_id: `gst_${String(i + 1).padStart(2, "0")}`,
    name: s.name,
    email: s.email,
    approval_status: s.status,
    checked_in_at: state.arrivals.get(s.email) ?? "",
    created_at: s.createdAt,
    [CHATGPT_HEADER]: s.chatgpt,
  }))
  return L.formatCsv(headers, rows)
}

function feedbackCsv() {
  const rows = SEED.filter((s) => s.feedback).map((s) => ({ Email: s.feedbackVia ?? s.email, Rating: "5" }))
  return L.formatCsv(["Email", "Rating"], rows)
}

function codesCsv(n) {
  const rows = Array.from({ length: n }, (_, i) => ({ code: `CODEX-DEMO-${String(i + 1).padStart(3, "0")}` }))
  return L.formatCsv(["code"], rows)
}

function strip(res) {
  const { ok, ...rest } = res
  return rest
}

function commandName(cmd) {
  const words = (cmd ?? "").replace(/^event-ops\s+/, "").split(/\s+/)
  return words[0] === "credits" ? words.slice(0, 2).join(" ") : words[0]
}

function entry({ comment, cmd, data, err, csv, nextSteps = [], pending = false }) {
  return { comment, cmd, data, err, csv, nextSteps, pending }
}

function build() {
  const c = state.config
  const ledger = L.createLedger({ eventSlug: EVENT, lumaEventId: LUMA_EVENT_ID, require: [...c.require], deliveryTarget: c.target })
  const sync = L.importLumaCsv(ledger, guestsCsv())
  const fb = L.importFeedbackCsv(ledger, feedbackCsv())
  const codes = L.importCreditsCsv(ledger, codesCsv(c.poolSize), { reserveCount: c.reserve })
  state.ledger = ledger
  state.assign = null
  state.burn = null
  state.pick = null
  state.sent = null
  state.lastSync = null
  state.setup = [
    entry({
      comment: "made-up data. Every result comes from ledger.mjs, running in this tab.",
      cmd: `event-ops credits init ${EVENT} --luma-event-id ${LUMA_EVENT_ID} --require ${c.require.join(",")} --target ${c.target}`,
      data: { event: EVENT, require: c.require, target: c.target },
    }),
    entry({ cmd: "event-ops credits sync --csv guests.csv", data: { source: "csv", ...strip(sync) } }),
    entry({ cmd: "event-ops credits import feedback feedback.csv", data: { kind: "feedback", ...strip(fb) } }),
    entry({
      cmd: `event-ops credits import codes codes.csv --reserve ${c.reserve}`,
      data: { kind: "codes", imported: codes.imported, mainAdded: codes.mainAdded, reserveAdded: codes.reserveAdded },
      nextSteps: ["event-ops credits assign --commit"],
    }),
  ]
}

function holders() {
  const ledger = state.ledger
  return ledger.codes
    .filter((c) => c.status === "assigned" && c.assignedTo)
    .map((c) => ({ guest: ledger.guests[c.assignedTo], code: c }))
    .filter((x) => x.guest)
}

function duplicateOf(g, held) {
  for (const { guest: o } of held) {
    if (o.canonicalLumaEmail === g.canonicalLumaEmail || o.canonicalChatgptEmail === g.canonicalLumaEmail) {
      return { kind: "dup-email", other: o }
    }
  }
  for (const { guest: o } of held) {
    if (
      g.canonicalChatgptEmail &&
      (o.canonicalChatgptEmail === g.canonicalChatgptEmail || o.canonicalLumaEmail === g.canonicalChatgptEmail)
    ) {
      return { kind: "shared-chatgpt", other: o }
    }
  }
  return { kind: "dup-email", other: null }
}

function outcomes() {
  const ledger = state.ledger
  const gates = ledger.config.require
  const blocked = new Map((state.assign?.blocked ?? []).map((b) => [b.email, b.reason]))
  const held = holders()
  return SEED.map((seed) => {
    const g = ledger.guests[seed.email]
    const code = L.getAssignedCode(ledger, g.id)
    if (code) return { g, kind: "code", code: code.code }
    if (gates.includes("approved") && g.approvalStatus !== "approved") return { g, kind: "waitlist" }
    if (gates.includes("checked-in") && !g.checkedInAt) return { g, kind: "no-show" }
    if (gates.includes("feedback") && !g.feedbackAt) return { g, kind: "no-feedback" }
    const reason = blocked.get(g.lumaEmail)
    if (reason === "duplicate-identity") return { g, ...duplicateOf(g, held) }
    if (reason === "pool-exhausted") return { g, kind: "out-of-codes" }
    return { g, kind: "pending" }
  })
}

function outcomeDetail(o) {
  if (o.kind === "dup-email") return o.other ? `Same inbox as ${o.other.name}` : "Same inbox as a guest who has a code"
  if (o.kind === "shared-chatgpt") return o.other ? `Same ChatGPT email as ${o.other.name}` : "Same ChatGPT email as another guest"
  if (o.kind === "out-of-codes") return "Add codes in Advanced settings"
  return null
}

function summaryParts(list) {
  const n = (...kinds) => list.filter((o) => kinds.includes(o.kind)).length
  return [
    { n: n("code"), text: (k) => plural(k, "code"), tone: "ok", always: true },
    { n: n("dup-email", "shared-chatgpt"), text: (k) => `${plural(k, "duplicate")} blocked`, tone: "bad" },
    { n: n("out-of-codes"), text: (k) => `${k} out of codes`, tone: "warn" },
    { n: n("no-show"), text: (k) => plural(k, "no-show"), tone: "muted" },
    { n: n("waitlist"), text: (k) => `${k} waitlist`, tone: "muted" },
    { n: n("no-feedback"), text: (k) => `${k} without feedback`, tone: "muted" },
  ].filter((p) => p.always || p.n > 0)
}

function summaryText(list) {
  return summaryParts(list)
    .map((p) => p.text(p.n))
    .join(" · ")
}

function chip(tone, text, { mono = false } = {}) {
  return h("span", { class: `chip chip-${tone}${mono ? " chip-mono" : ""}`, text })
}

function who(g, detail) {
  return h(
    "span",
    { class: "row-who" },
    h("span", { class: "row-name", text: g.name }),
    h("span", { class: "row-email", text: g.lumaEmail }),
    detail ? h("span", { class: "row-detail", text: detail }) : null,
  )
}

function viewGuests() {
  const guests = SEED.map((s) => state.ledger.guests[s.email])
  const list = h(
    "ul",
    { class: "rows", "aria-label": "Guests" },
    guests.map((g, i) => {
      const ok = g.approvalStatus === "approved"
      return h(
        "li",
        { class: "row", style: `--i:${i}` },
        who(g),
        h("span", { class: "row-aside" }, ok ? h("span", { class: "tag-quiet", text: "Approved" }) : chip("muted", "Waitlist")),
      )
    }),
  )
  return {
    copy: `${plural(guests.length, "person", "people")} signed up on Luma for a Codex meetup. You have ${plural(state.config.poolSize, "credit code")} to hand out.`,
    body: [list],
    primary: { label: "Event night", action: () => goTo(2) },
  }
}

function arrivedCount() {
  return SEED.filter((s) => state.ledger.guests[s.email].checkedInAt).length
}

function viewNight() {
  const rows = SEED.map((s, i) => {
    const g = state.ledger.guests[s.email]
    const on = Boolean(g.checkedInAt)
    const sw = h("ui-switch", { "data-email": g.lumaEmail, "aria-label": `${g.name} arrived`, checked: on }, h("ui-switch-thumb"))
    return h(
      "li",
      { class: "row-li", style: `--i:${i}` },
      h(
        "label",
        { class: `row row-toggle${on ? " is-on" : ""}`, "data-row": g.lumaEmail },
        who(g),
        h("span", { class: "row-aside" }, h("span", { class: "row-state", "data-state": "", text: on ? "Arrived" : "Didn't come" }), sw),
      ),
    )
  })
  return {
    copy: "Volunteers scan each ticket at the door with Luma. Flip a switch to change who came.",
    body: [
      h("p", {
        class: "count-line",
        id: "arrived-count",
        text: `${arrivedCount()} of ${SEED.length} arrived. Try marking Diego as arrived.`,
      }),
      h("ul", { class: "rows", "aria-label": "Check-ins" }, rows),
    ],
    primary: { label: "Give out codes", action: giveOutCodes },
  }
}

function summaryNode(list) {
  const kids = []
  summaryParts(list).forEach((p, i) => {
    if (i) kids.push(h("span", { class: "sum-dot", "aria-hidden": "true", text: " · " }))
    kids.push(h("span", { class: `sum-part sum-${p.tone}`, text: p.text(p.n) }))
  })
  return h("p", { class: "summary", id: "summary" }, kids)
}

function outcomeRow(o, i) {
  const meta = OUTCOME[o.kind]
  const aside = o.kind === "code" ? chip("ok", o.code, { mono: true }) : chip(meta.tone, meta.label)
  return h(
    "li",
    { class: `row row-${meta.tone}`, style: `--i:${i}`, "data-kind": o.kind },
    who(o.g, outcomeDetail(o)),
    h("span", { class: "row-aside" }, o.kind === "code" ? h("span", { class: "sr-only", text: "Gets code " }) : null, aside),
  )
}

function viewCodes() {
  const list = outcomes()
  return {
    copy: "The ledger gives one code to each person who came. Green rows get a code, and every other row shows why.",
    body: [
      summaryNode(list),
      h("ul", { class: "rows rows-outcome", id: "outcomes", "aria-label": "Who gets a code" }, list.map(outcomeRow)),
    ],
    primary: { label: "Next", action: () => goTo(4) },
  }
}

function swapNode(burn) {
  if (!burn.ok) {
    return h(
      "div",
      { class: "swap swap-error", role: "alert" },
      h("span", { class: "swap-who", text: "No spare codes left" }),
      h("span", { class: "swap-note", text: "Every code is in use. Add more in Advanced settings, then try again." }),
    )
  }
  return h(
    "div",
    { class: "swap", role: "status" },
    h("span", { class: "swap-who", text: burn.name }),
    h(
      "span",
      { class: "swap-codes" },
      h("span", { class: "sr-only", text: "Old code " }),
      h("s", { class: "swap-old", text: burn.burnedCode }),
      h("span", { class: "swap-arrow", "aria-hidden": "true", text: "→" }),
      h("span", { class: "sr-only", text: " replaced with " }),
      h("span", { class: "swap-new", text: burn.newCode }),
    ),
    h("span", {
      class: "swap-note",
      text: `The old code is burned so nobody can use it. The new one came from ${burn.usedReserve ? "the reserve" : "the unused codes"}.`,
    }),
  )
}

function viewFix() {
  const held = holders()
  if (!state.pick || !held.some((x) => x.guest.lumaEmail === state.pick)) state.pick = held[0]?.guest.lumaEmail ?? null
  const burn = state.burn
  const body = burn ? [swapNode(burn)] : []
  if (!burn?.ok) {
    const group = h(
      "ui-radio-group",
      { class: "picks", id: "picks", "aria-label": "Guest whose code fails", "default-value": state.pick ?? "" },
      held.map(({ guest, code }) =>
        h(
          "label",
          { class: "pick" },
          h("ui-radio", { value: guest.lumaEmail }, h("ui-radio-indicator")),
          who(guest),
          h("span", { class: "row-aside" }, chip("ok", code.code, { mono: true })),
        ),
      ),
    )
    group.addEventListener("valuechange", (e) => {
      state.pick = e.detail.value
      renderCli()
    })
    body.push(group)
  }
  return {
    copy: burn?.ok
      ? `${firstName(burn.name)} has a working code again, and the ledger keeps the history.`
      : "A guest writes back that their code fails. Pick them and swap in a fresh one.",
    body,
    primary: burn?.ok
      ? { label: "Next", action: () => goTo(5) }
      : { label: "Replace it", action: replaceCode, disabled: held.length === 0 },
    secondary: burn?.ok ? { label: "Replace another", action: replaceAnother } : { label: "Skip", action: () => goTo(5) },
  }
}

function emailPreview(row) {
  return h(
    "figure",
    { class: "mail", "aria-label": `Email preview for ${row.name}` },
    h(
      "dl",
      { class: "mail-head" },
      h("div", {}, h("dt", { text: "From" }), h("dd", { class: "mono", text: MAIL_FROM })),
      h("div", {}, h("dt", { text: "To" }), h("dd", { class: "mono", text: row.delivery_email })),
      h("div", {}, h("dt", { text: "Subject" }), h("dd", { text: MAIL_SUBJECT })),
    ),
    h(
      "div",
      { class: "mail-body" },
      h("p", { text: `Hi ${firstName(row.name)}, thanks for coming to ${EVENT_NAME}. Here is your OpenAI credit code.` }),
      h("p", { class: "mail-code", text: row.code }),
      h("p", { text: "It works once. Reply to this email if it gives you trouble." }),
    ),
  )
}

function installBlock() {
  const cmds = PM[state.pm]
  const item = (key, label) =>
    h(
      "li",
      { class: "cmd" },
      h("span", { class: "cmd-label", text: label }),
      h(
        "div",
        { class: "cmd-body" },
        h("code", { "data-cmd": key }, hlShell(cmds[key])),
        h("button", { type: "button", class: "copy", "data-copy": key, "aria-label": `Copy: ${label}`, text: "Copy" }),
      ),
    )
  return h(
    "section",
    { class: "real", "aria-labelledby": "real-title" },
    h("h3", { class: "real-title", id: "real-title", text: "Do this with your real event" }),
    h("p", { class: "real-copy", text: "Install the CLI, point it at your Luma event and your codes file, and run the same steps." }),
    h(
      "ol",
      { class: "cmds" },
      item("install", "Install the CLI"),
      item("skills", "Add the skills to your agent"),
      item("demo", "Try it offline"),
    ),
  )
}

function unsentRows() {
  const target = state.ledger.config.deliveryTarget
  return holders()
    .filter(({ code }) => !code.sentAt)
    .map(({ guest, code }) => ({ name: guest.name, delivery_email: L.deliveryEmailFor(guest, target), code: code.code }))
}

function viewSend() {
  const unsent = unsentRows()
  const sent = state.sent
  const body = []
  if (sent) {
    body.push(
      h(
        "p",
        { class: "sent-line" },
        h("span", { class: "sent-n", text: `${plural(sent.rows.length, "email")} sent` }),
        h("span", { class: "sent-note", text: sent.rows.length ? "Each code is now marked as sent." : "Every code already went out." }),
      ),
    )
  } else {
    const who = unsent[0] ? firstName(unsent[0].name) : "each guest"
    body.push(h("p", { class: "count-line", text: `${plural(unsent.length, "email")} ready. This is what ${who} gets.` }))
  }
  const previewRow = sent?.rows[0] ?? unsent[0]
  if (previewRow) body.push(emailPreview(previewRow))
  if (sent) body.push(installBlock())
  return {
    copy: "Each guest gets one email with their code. Run it again and nobody gets a second one.",
    body,
    primary: unsent.length ? { label: sent ? `Send ${plural(unsent.length, "new email")}` : "Send emails", action: sendEmails } : null,
    secondary: sent ? { label: "Start over", action: startOver } : null,
  }
}

const VIEWS = [viewGuests, viewNight, viewCodes, viewFix, viewSend]

function giveOutCodes() {
  build()
  state.assign = L.assignCodes(state.ledger, { commit: true })
  state.animate = true
  state.maxStep = 3
  goTo(3)
}

function replaceCode() {
  const email = state.pick
  if (!email) return
  const guest = state.ledger.guests[email]
  const res = L.burnAndReplace(state.ledger, email, "reported-broken")
  state.burn = res.ok ? { ...res, email, name: guest.name } : { ok: false, error: res.error, email }
  state.sent = null
  render()
  announce(res.ok ? `${guest.name} now has ${res.newCode}. ${res.burnedCode} is burned.` : "No spare codes left.")
}

function replaceAnother() {
  state.burn = null
  render()
  $("primary").focus()
}

function sendEmails() {
  const rows = L.exportDispatchRows(state.ledger, { onlyUnsent: true, markSent: true })
  state.sent = { rows, csv: L.formatCsv(DISPATCH_HEADERS, rows) }
  render()
  announce(`${plural(rows.length, "email")} sent.`)
  $("real-title")?.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "nearest" })
}

function startOver() {
  state.arrivals = freshArrivals()
  build()
  state.maxStep = 1
  goTo(1)
}

function setArrived(email, on) {
  const guest = state.ledger.guests[email]
  if (!guest) return
  if (on) {
    state.arrivals.set(email, new Date().toISOString())
    const res = L.importLumaCsv(state.ledger, guestsCsv())
    state.lastSync = entry({
      comment: `${guest.name} scanned at the door`,
      cmd: "event-ops credits sync --csv guests.csv",
      data: { source: "csv", ...strip(res) },
    })
  } else {
    state.arrivals.delete(email)
    guest.checkedInAt = null
    state.lastSync = entry({
      comment: `sandbox only. ${guest.name} unmarked. Luma sync only adds check-ins, so a real ledger keeps every one.`,
    })
  }
  state.assign = null
  state.burn = null
  state.sent = null
  state.maxStep = 2
  const row = document.querySelector(`[data-row="${CSS.escape(email)}"]`)
  if (row) {
    row.classList.toggle("is-on", on)
    row.querySelector("[data-state]").textContent = on ? "Arrived" : "Didn't come"
  }
  const count = $("arrived-count")
  if (count) count.textContent = `${arrivedCount()} of ${SEED.length} arrived.`
  renderStepper()
  renderCli()
}

function cliEntries() {
  const ledger = state.ledger
  if (state.step === 1) return state.setup
  if (state.step === 2) {
    const a = L.auditLedger(ledger)
    const status = entry({
      cmd: "event-ops credits status",
      data: { counts: a.counts, require: a.require },
      nextSteps: ["event-ops credits assign --commit"],
    })
    return [state.lastSync, status].filter(Boolean)
  }
  if (state.step === 3) {
    const r = state.assign
    const cmd = "event-ops credits assign --commit"
    if (!r) return [entry({ comment: "runs when you press Give out codes", cmd, pending: true })]
    const plan = r.plan.map((p) => ({ name: p.name, deliveryEmail: p.deliveryEmail, code: p.code }))
    return [
      entry({
        cmd,
        data: { committed: r.committed, assignedCount: r.assignedCount, blocked: r.blocked, plan },
        nextSteps: ["event-ops credits send --from … --subject …", "event-ops credits export --mark-sent"],
      }),
    ]
  }
  if (state.step === 4) {
    const b = state.burn
    const cmd = `event-ops credits burn ${b?.email ?? state.pick ?? "<email>"}`
    if (!b) return [entry({ comment: "runs when you press Replace it", cmd, pending: true })]
    if (!b.ok) {
      const err = {
        code: b.error,
        message: "No free or reserve code left to replace it",
        hint: "Import more codes with `event-ops credits import codes <file>`",
      }
      return [entry({ cmd, err })]
    }
    return [entry({ cmd, data: { guestId: b.guestId, burnedCode: b.burnedCode, newCode: b.newCode, usedReserve: b.usedReserve } })]
  }
  const s = state.sent
  const cmd = "event-ops credits export --out dispatch.csv --mark-sent"
  const alt = entry({ comment: "or send through Resend with event-ops credits send --from … --subject … --confirm" })
  if (!s) return [entry({ comment: "runs when you press Send emails", cmd, pending: true }), alt]
  return [
    entry({ cmd, data: { exported: s.rows.length, markedSent: true, outPath: "dispatch.csv" }, nextSteps: ["event-ops credits status"] }),
    entry({ comment: "dispatch.csv", csv: s.csv }),
    alt,
  ]
}

function cliEntryNode(e) {
  const out = e.data !== undefined ? { ok: true, command: commandName(e.cmd), data: e.data, nextSteps: e.nextSteps } : undefined
  const err = e.err !== undefined ? { ok: false, command: commandName(e.cmd), error: e.err } : undefined
  return h(
    "div",
    { class: `t-entry${e.pending ? " t-pending" : ""}` },
    e.comment ? h("div", { class: "t-comment tk-com", text: `# ${e.comment}` }) : null,
    e.cmd ? h("div", { class: "t-cmd" }, h("span", { class: "tk-prompt", "aria-hidden": "true", text: "$ " }), hlShell(e.cmd)) : null,
    out ? h("pre", { class: "t-out" }, hlJson(out)) : null,
    err ? h("pre", { class: "t-err" }, hlJson(err, { error: true })) : null,
    err ? h("div", { class: "t-exit", text: "exit 3" }) : null,
    e.csv ? h("pre", { class: "t-out t-csv" }, hlCsv(e.csv)) : null,
  )
}

function renderCli() {
  const body = $("cli-body")
  body.replaceChildren(...cliEntries().map(cliEntryNode))
  body.scrollTop = 0
}

function renderStepper() {
  for (const btn of document.querySelectorAll("#stepper [data-goto]")) {
    const n = Number(btn.dataset.goto)
    const li = btn.parentElement
    li.toggleAttribute("data-current", n === state.step)
    li.toggleAttribute("data-done", n < state.step)
    if (n === state.step) btn.setAttribute("aria-current", "step")
    else btn.removeAttribute("aria-current")
    btn.disabled = n > state.maxStep
  }
}

function setButton(el, spec) {
  el.hidden = !spec
  el.onclick = spec?.action ?? null
  if (!spec) return
  el.textContent = spec.label
  el.disabled = Boolean(spec.disabled)
}

function revealOutcomes() {
  const rows = $("outcomes")
  const summary = $("summary")
  if (!rows || reduceMotion.matches) return
  rows.classList.add("is-pending")
  summary?.classList.add("is-pending")
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      rows.classList.remove("is-pending")
      summary?.classList.remove("is-pending")
    }),
  )
}

function enterStory() {
  const story = $("story")
  if (reduceMotion.matches) return
  story.classList.remove("is-entering")
  void story.offsetWidth
  story.classList.add("is-entering")
}

function render({ enter = false } = {}) {
  const view = VIEWS[state.step - 1]()
  renderStepper()
  $("step-count").textContent = `Step ${state.step} of ${STEPS.length}`
  $("step-title").textContent = STEPS[state.step - 1]
  $("step-copy").textContent = view.copy
  $("step-body").replaceChildren(...view.body)
  setButton($("primary"), view.primary)
  setButton($("secondary"), view.secondary)
  $("back").hidden = state.step === 1
  renderCli()
  if (enter) enterStory()
  if (state.step === 3 && state.animate) {
    revealOutcomes()
    state.animate = false
  }
}

function announce(text) {
  const el = $("announce")
  el.textContent = ""
  setTimeout(() => {
    el.textContent = text
  }, 60)
}

function goTo(n, { focus = true } = {}) {
  if (n < 1 || n > STEPS.length || n > state.maxStep + 1) return
  state.step = n
  state.maxStep = Math.max(state.maxStep, n)
  render({ enter: true })
  if (focus) {
    $("step-title").focus({ preventScroll: true })
    const top = $("cli").getBoundingClientRect().top
    if (top < 0 || top > window.innerHeight * 0.6) {
      $("cli").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" })
    }
  }
  if (n === 3) announce(summaryText(outcomes()))
}

function applyConfig(message) {
  build()
  if (state.step >= 3) {
    state.assign = L.assignCodes(state.ledger, { commit: true })
    state.animate = true
    state.maxStep = 3
    state.step = 3
    render({ enter: true })
    notify("default", message, { description: "Codes given out again with the new settings." })
    announce(summaryText(outcomes()))
    return
  }
  state.maxStep = Math.min(state.maxStep, 2)
  render()
  notify("default", message)
}

function readPoolInputs() {
  const size = Math.max(1, Math.min(30, Number.parseInt($("pool-size").value, 10) || 1))
  const reserve = Math.max(0, Math.min(size, Number.parseInt($("pool-reserve").value, 10) || 0))
  $("pool-size").value = String(size)
  $("pool-reserve").value = String(reserve)
  return { size, reserve }
}

function renderPrompt() {
  for (const pre of document.querySelectorAll("[data-prompt]")) pre.textContent = PM[state.pm].prompt
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = h("textarea", { class: "sr-only", "aria-hidden": "true" })
    ta.value = text
    document.body.append(ta)
    ta.select()
    const ok = document.execCommand("copy")
    ta.remove()
    return ok
  }
}

function syncAdvanced() {
  setProp($("gates"), "ui-checkbox-group", "value", [...state.config.require])
  setProp($("target"), "ui-select", "value", state.config.target)
  $("pool-size").value = String(state.config.poolSize)
  $("pool-reserve").value = String(state.config.reserve)
}

function onPoolChange() {
  const { size, reserve } = readPoolInputs()
  if (size === state.config.poolSize && reserve === state.config.reserve) return
  state.config.poolSize = size
  state.config.reserve = reserve
  applyConfig(`${plural(size, "code")}, ${reserve} in reserve`)
}

function resetDemo() {
  state.config = { ...DEFAULTS, require: [...DEFAULTS.require] }
  state.arrivals = freshArrivals()
  syncAdvanced()
  build()
  state.maxStep = 1
  goTo(1, { focus: false })
  notify("default", "Demo reset", { description: "Back to the ten guests and eight codes." })
}

function wire() {
  for (const btn of document.querySelectorAll("#stepper [data-goto]")) {
    btn.addEventListener("click", () => goTo(Number(btn.dataset.goto)))
  }
  $("back").addEventListener("click", () => goTo(state.step - 1))

  document.addEventListener("click", async (e) => {
    const btn = e.target instanceof Element ? e.target.closest("button[data-copy]") : null
    if (!btn) return
    const text = PM[state.pm][btn.dataset.copy]
    const description = btn.dataset.copy === "prompt" ? "Paste it into Codex, Claude Code or Cursor." : text
    if (await copyText(text)) notify("success", btn.dataset.copy === "prompt" ? "Prompt copied" : "Copied", { description })
    else notify("error", "Copy failed", { description: "Select the command and copy it by hand." })
  })

  $("pm").addEventListener("valuechange", (e) => {
    if (!PM[e.detail.value]) return
    state.pm = e.detail.value
    for (const code of document.querySelectorAll("code[data-cmd]")) code.replaceChildren(hlShell(PM[state.pm][code.dataset.cmd]))
    renderPrompt()
  })

  $("step-body").addEventListener(
    "checkedchange",
    (e) => {
      const sw = e.target instanceof Element ? e.target.closest("ui-switch[data-email]") : null
      if (!sw) return
      const on = Boolean(e.detail.value)
      setTimeout(() => setArrived(sw.dataset.email, on))
    },
    { capture: true },
  )

  $("gates").addEventListener("valuechange", (e) => {
    const next = e.detail.value ?? []
    if (next.length === 0) {
      e.preventDefault()
      notify("warning", "Keep at least one rule", { description: "The CLI defaults to checked in." })
      return
    }
    setTimeout(() => {
      state.config.require = GATE_ORDER.filter((g) => next.includes(g))
      applyConfig("Rules updated")
    })
  })

  $("target").addEventListener("valuechange", (e) => {
    const value = e.detail.value
    if (!value || value === state.config.target) return
    setTimeout(() => {
      state.config.target = value
      applyConfig(value === "chatgpt" ? "Codes go to the ChatGPT email" : "Codes go to the Luma email")
    })
  })

  $("pool-size").addEventListener("change", onPoolChange)
  $("pool-reserve").addEventListener("change", onPoolChange)
  $("reset").addEventListener("click", resetDemo)

  for (const code of document.querySelectorAll("code[data-cmd]")) code.replaceChildren(hlShell(code.textContent))
  renderPrompt()
  for (const code of document.querySelectorAll(".commands td:first-child code")) code.replaceChildren(hlShell(code.textContent))
}

async function whenReady() {
  const timeout = new Promise((resolve) => setTimeout(resolve, 5000))
  const defined = Promise.all(STATIC_TAGS.map((t) => customElements.whenDefined(t)))
  const toastModule = import(`${UI_SDK}/toast.js`)
    .then((m) => {
      toast = m.toast
    })
    .catch(() => {})
  await Promise.race([Promise.all([defined, toastModule]), timeout])
}

await whenReady()
if (window.matchMedia(WIDE).matches) setProp($("cli"), "ui-collapsible", "open", true)
wire()
build()
render()
document.documentElement.dataset.ready = ""
