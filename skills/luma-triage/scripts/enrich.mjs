#!/usr/bin/env node
// Enrich a Luma guest export with public signals. Deterministic only: no ranking.
// Usage: node enrich.mjs <guests.csv> [--status pending_approval] [--out enriched.json]
import { readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"

const args = process.argv.slice(2)
const csvPath = args[0]
if (!csvPath) {
  console.error("usage: enrich.mjs <guests.csv> [--status pending_approval] [--out enriched.json]")
  process.exit(2)
}
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const status = flag("--status")
const out = flag("--out")

function parseCsv(text) {
  const rows = []
  let row = [], field = "", quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ",") { row.push(field); field = "" }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field); rows.push(row); row = []; field = ""
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [header, ...body] = rows.filter((r) => r.some(Boolean))
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])))
}

// Luma's fixed export columns. Anything else is a custom registration question.
const LUMA_COLUMNS = new Set(["guest_id", "name", "first_name", "last_name", "email", "phone_number", "created_at", "approval_status", "checked_in_at", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "google_click_id", "meta_click_id", "x_click_id", "linkedin_click_id", "tiktok_click_id", "reddit_click_id", "yandex_click_id", "referrer", "referred_by", "qr_code_url", "amount", "amount_tax", "amount_discount", "currency", "coupon_code", "eth_address", "solana_address", "survey_response_rating", "survey_response_feedback", "ticket_type_id", "ticket_name"])

const URL_RE = /https?:\/\/[^\s,"']+|(?:www\.)?(?:linkedin\.com|github\.com|x\.com|twitter\.com)\/[^\s,"']+/gi
const ANON_DOMAINS = ["privaterelay.appleid.com", "keemail.me", "duck.com", "simplelogin", "anonaddy", "proton.me"]
const PLACEHOLDER = /\/(in|)\/?(ddd|test|asdf|xxx|na|none|-)\/?$/i

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function gh(path) {
  // Search API allows 30 req/min; back off on rate limit instead of failing.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }))
    } catch (error) {
      const msg = String(error.stderr ?? error.message)
      if (/rate limit/i.test(msg)) { await sleep(65_000); continue }
      if (/Not Found|404/.test(msg)) return null
      return null
    }
  }
  return null
}

async function githubProfile(login) {
  const user = await gh(`users/${login}`)
  if (!user) return null
  const repos = (await gh(`users/${login}/repos?sort=pushed&per_page=6`)) ?? []
  const socials = (await gh(`users/${login}/social_accounts`)) ?? []
  return {
    login: user.login, name: user.name, bio: user.bio, company: user.company, location: user.location,
    blog: user.blog || null, twitter: user.twitter_username, followers: user.followers, publicRepos: user.public_repos,
    createdAt: user.created_at, socials: socials.map((s) => s.url),
    recentRepos: repos.filter((r) => !r.fork).map((r) => ({ name: r.name, stars: r.stargazers_count, language: r.language, pushedAt: r.pushed_at?.slice(0, 10), description: r.description })),
  }
}

async function siteSummary(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "follow" })
    const html = await res.text()
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
    const description = html.match(/name="description"\s+content="([^"]*)"/i)?.[1]
    return { url, status: res.status, title: title?.slice(0, 160) ?? null, description: description?.slice(0, 300) ?? null }
  } catch (error) {
    return { url, error: String(error.message) }
  }
}

async function crafterDirectory() {
  try {
    const html = await (await fetch("https://crafter.run/es/crafters", { signal: AbortSignal.timeout(20_000) })).text()
    return [...new Set([...html.matchAll(/\/crafters\/([A-Za-z0-9_.-]+)/g)].map((m) => m[1]))]
  } catch {
    return []
  }
}

const normalize = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

const guests = parseCsv(readFileSync(csvPath, "utf8").replace(/^﻿/, ""))
const questions = Object.keys(guests[0] ?? {}).filter((k) => !LUMA_COLUMNS.has(k))
const counts = guests.reduce((acc, g) => ({ ...acc, [g.approval_status]: (acc[g.approval_status] ?? 0) + 1 }), {})
const targets = status ? guests.filter((g) => g.approval_status === status) : guests
const crafters = await crafterDirectory()

const results = []
for (const g of targets) {
  const answers = Object.fromEntries(questions.map((q) => [q, g[q]]).filter(([, v]) => v))
  const links = [...new Set(Object.values(answers).join(" ").match(URL_RE) ?? [])].map((u) => (u.startsWith("http") ? u : `https://${u}`))
  const flags = []
  const domain = g.email.split("@")[1] ?? ""
  if (ANON_DOMAINS.some((d) => domain.includes(d))) flags.push("anonymous-email")
  if (links.some((u) => PLACEHOLDER.test(u))) flags.push("placeholder-link")

  const ghLogins = links.map((u) => u.match(/github\.com\/([A-Za-z0-9-]+)/i)?.[1]).filter(Boolean)
  const github = []
  for (const login of new Set(ghLogins)) github.push({ source: "registration", profile: await githubProfile(login) })
  if (!github.length) {
    const byEmail = await gh(`search/users?q=${encodeURIComponent(`${g.email} in:email`)}`)
    for (const item of byEmail?.items?.slice(0, 1) ?? []) github.push({ source: "email-match", profile: await githubProfile(item.login) })
  }
  if (!github.length && g.name.trim().split(/\s+/).length >= 2) {
    const byName = await gh(`search/users?q=${encodeURIComponent(`fullname:"${g.name.trim()}"`)}`)
    for (const item of byName?.items?.slice(0, 2) ?? []) github.push({ source: "name-match", profile: await githubProfile(item.login) })
  }

  // A registration name that disagrees with the linked GitHub name is a mismatch signal, not proof.
  for (const { source, profile } of github) {
    if (source === "registration" && profile?.name) {
      const first = normalize((g.first_name || g.name).split(/\s+/)[0])
      if (first && !normalize(profile.name).includes(first)) flags.push(`name-mismatch:${profile.login}`)
    }
  }

  const handle = normalize(g.email.split("@")[0])
  const crafterMatches = crafters.filter((c) => handle.includes(normalize(c)) && c.length >= 4)
  const sites = []
  for (const u of links.filter((u) => !/linkedin\.com|github\.com|x\.com|twitter\.com/i.test(u))) sites.push(await siteSummary(u))
  for (const { profile } of github) if (profile?.blog) sites.push(await siteSummary(profile.blog.startsWith("http") ? profile.blog : `https://${profile.blog}`))

  results.push({
    name: g.name, email: g.email, status: g.approval_status, registeredAt: g.created_at?.slice(0, 10),
    emailDomain: domain, answers, links, github, crafter: crafterMatches.map((c) => `https://crafter.run/es/crafters/${c}`), sites, flags,
  })
  process.stderr.write(`enriched ${results.length}/${targets.length}\n`)
}

const report = { csv: csvPath, total: guests.length, counts, questions, filtered: status ?? null, guests: results }
const json = JSON.stringify(report, null, 2)
if (out) writeFileSync(out, json)
else console.log(json)
