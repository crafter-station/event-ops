---
name: codex-event-ops
description: End-to-end operational playbook for hosting Codex Community events (meetups, workshops, DevDay Exchanges, hackathons). Covers Luma setup, overbooking math, food/swag ratios, venue/outlets/security preflight, Reimbi and credit request timelines, live agenda rules, and post-event recap. Use when planning, auditing, or wrapping up a Codex Ambassador event.
---

# Codex Event Ops

Battle-tested checklist compiled from Codex Ambassador events globally and DevDay Exchange Lima.

## 1. Luma setup (before publishing)

1. Keep the event **private** until copy, venue, cover assets, and questions are finalized.
2. Enable **Require Approval** (never first-come-first-served). Approve people incrementally every day so early signups know they are in.
3. Never mark the event **Sold Out**; keep the waitlist open.
4. Set **Guest List to Hidden** so attendees cannot spam each other.
5. Add a required registration question for their **ChatGPT / OpenAI email** (often differs from their Luma email).
6. Give volunteers **Check-in Staff** access (not Host) so they do not see or export the full attendee list.
7. Pre-configure the **Luma Feedback email** before the event starts.

For triaging pending signups, use the `luma-triage` skill.

## 2. Capacity, food, and swag math

- **Show-up rate**: expect 50-70% of approved guests. Hedge by setting approvals 25-30% above comfortable room capacity.
- **First event size**: start around 50 in-room (~80-100 approved). Above 80, logistics scale nonlinearly.
- **Food**: shareables only (pizza is the default; never 1:1 bowls). Budget ~0.5 pizza per expected attendee.
- **Swag**: separate "for everyone" items (stickers, totes) from "giveaway prizes" (bottles). Map inventory against expected headcount, fix the exact number of winners before inviting people on stage, and keep 1-2 spares.

## 3. Admin & vendor preflight (T-14 to T-3)

- **Credits**: request attendee credits at least **3 business days** ahead.
- **Reimbi**: verify your reimbursement account is active before spending any money.
- **Cashflow**: ask venues and food vendors for Net-14 payment terms so you do not float personal cash while waiting for reimbursement.
- **Partner roles**: agree in writing on who owns logistics vs. speaking/judging/venue. Reserve co-organizer credit for those sharing operational work. Keep branding compliant with Codex Community guidelines (thank venues/partners in description and recap; no unapproved co-branding).

## 4. Venue & door preflight (T-7 to T-1)

- **Power & tables**: if promising a hands-on build session, verify outlets, power strips, tables, and Wi-Fi capacity in person. An auditorium without outlets kills live building.
- **Formalities**: if hosting at a university or corporate venue, cap institutional welcome remarks at 5 minutes upfront so they do not eat the build block.
- **Door policy**: align a single entry requirement with venue security, check for competing campus/building events, put up signage, and assign one dedicated person to the door for the first 30-60 minutes (never the host).
- **Roles**: assign check-in, timekeeper, photographer (with a mandatory shot list: room, speaker, demo, group photo, team), and tech support.

## 5. Agenda & energy (3-hour meetup/workshop format)

- Start with 15-20 minutes of networking + food so late arrivals do not interrupt the talk.
- Keep talks short (<20-30 min) and **interactive**. Tab in and out of Codex CLI/app; live demos beat slides every time.
- For community demos, ban slide decks and pre-recorded videos.
- Protect a dedicated **build & ship** block or structured networking at the end.

## 6. Credits & check-in execution

Never manually merge CSVs under pressure or split check-in across two tools.
- Volunteers scan tickets in Luma's native app using the **Check-in Staff** role (hides the guest list and keeps `checked_in_at` as the single source of truth).
- Use the `luma-credits` skill (`credit-desk.mjs`) to sync Luma (API key or CSV fallback), gate on `checked-in` and optional `feedback`, block duplicate Gmail/ChatGPT identities, hold reserve codes for `burn`/replace, and dispatch 1 unique code per attendee via Resend or mail-merge CSV.

## 7. Post-event wrap-up (T+1 to T+3)

- Export final funnel (registered, approved, checked-in, credits claimed) from the ledger.
- Submit itemized F&B receipts to Reimbi immediately.
- Post recap in `#ext-amb-codex-events-recap` with real numbers, format, photos, and one honest lesson learned.
