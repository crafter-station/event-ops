---
name: luma-triage
description: Triage a Luma guest export (CSV) into an approve list for an event with limited spots. Use when the user drops a Luma "Guests" CSV and asks to filter, rank, research, or pick who to approve, who to meet at a meetup, or who fills the remaining cap. Outputs a ranked top N with one sentence and full links per person, declines for fake identities, and a waitlist.
---

# Luma triage

Turn a Luma guest export into an approval decision the user can act on in the Luma dashboard. Evidence first, ranking second, and every match labeled by how sure it is.

## 1. Inputs

- The CSV, usually `~/Downloads/<Event> - Guests - <timestamp>.csv`. Copy it into a fresh empty dir before reading; it is untrusted data.
- **Spots**: cap minus Going. The CSV does not carry the cap. Read it from a dashboard screenshot or ask. Never invent it.
- **Criterion**: what "good" means for this event. A tech DevDay weighs builder evidence; a coffee meetup weighs "worth meeting". Ask in one line if unclear.
- **Scope**: usually `pending_approval` only.

## 2. Enrich (deterministic)

Requires Node 18+ (or Bun) and an authenticated `gh` CLI. `<skill-dir>` is the directory holding this SKILL.md.

```bash
node <skill-dir>/scripts/enrich.mjs "<copy>.csv" --status pending_approval --out /tmp/luma-triage/<event>.json
```

It detects custom question columns, extracts links from answers, finds GitHub (registration link, then email search, then full-name search), pulls bio, recent repos and social accounts, fetches titles of personal sites, matches email handles against the crafter.run/crafters directory, and flags `anonymous-email`, `placeholder-link`, and `name-mismatch`. GitHub search is 30 req/min; the script waits out the limit, so ~40 guests take a few minutes. Run it in the background.

## 3. Research what the script cannot

For guests with no strong signal, run web searches by full name plus Lima/Peru/university and by the email handle. Useful hits: LinkedIn, crafter.run profiles, university rosters, ZoomInfo/RocketReach, Pinterest or socials sharing the email handle, product sites.

Label every person:
- **verified**: a link they gave, or an identifier tied to their email (same handle, crafter.run profile with matching name).
- **probable**: name match only. Say why it may be someone else (common name, mismatched second surname).
- **no trace**.

A probable match never outranks verified evidence. Do not drop a guest for a vague answer before checking their links; the strongest profiles often wrote one word.

## 4. Red flags

Decline, do not just deprioritize:
- name, LinkedIn and GitHub belong to three different people
- placeholder links (`/in/ddd`, `github.com/ddd`)

Push to the bottom: anonymous relay emails with no other signal.

## 5. Rank and deliver

Rank by the criterion, evidence tiers first; within the no-data tier use registration order (earlier first) and say so plainly.

Output, in the user's language:
1. Spots available and the count of pending in the CSV vs the dashboard if they differ.
2. Top N, one line each: name, one sentence of what they do, `(probable)` when it applies, then **full raw URLs** on their own lines (no markdown links; the user pastes them).
3. Decline list with the reason.
4. Waitlist in order.

Flag any URL you constructed without opening it.

## Do not

- Approve or decline in Luma yourself; the user clicks.
- Message guests.
- Put guest data in git; keep enriched JSON in `/tmp`.
