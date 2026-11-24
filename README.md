# event-ops

Agent-first CLI and skills for running community tech events end to end: Luma triage, idempotent anti-abuse credit distribution, and battle-tested event ops playbooks.

Zero external dependencies. Runs on **Node 18+** or **Bun**. Works with **Luma Plus API (`LUMA_API_KEY`)** and falls back seamlessly to **Luma CSV exports** on free plans.

## Try it in 1 second

Run the offline sandbox to see Luma import, external feedback gating, Gmail/ChatGPT duplicate blocking, reserve burn/replace, and CSV dispatch in action:

```bash
node skills/luma-credits/scripts/credit-desk.mjs demo
```

## Why email-first?

Running a live claim web app on venue Wi-Fi breaks at 200+ attendees and invites email spoofing without auth. `luma-credits` solves the root problem with zero servers to crash:

1. **Volunteers use Luma's native Check-in Staff role** (no full guest list exposed, single source of truth for `checked_in_at`).
2. **Identity travels through the verified inbox** (no public claim form to spoof or enumerate).
3. **One idempotent local ledger** merges Luma (API or CSV) + optional Feedback CSV + OpenAI Credits CSV, blocks Gmail aliases (`a.b+1@gmail.com`) and shared ChatGPT emails, holds reserve codes for `burn`/replace, and dispatches via **Resend** or **mail-merge CSV** (100% resumable).

```text
  Luma Plus API (LUMA_API_KEY) ──┐
  or Luma Guests CSV (free)  ────┼──► Idempotent JSON Ledger ──► audit (dupe flags)
  Optional Feedback CSV      ────┤           │                        │
  OpenAI Credits CSV (+resv) ────┘           └──────────────────► assign --commit
                                                                      │
                                             Resend 1-to-1 (send) ◄───┴───► Mail-merge CSV (export)
```

## Real event quickstart

```bash
SCRIPT=skills/luma-credits/scripts/credit-desk.mjs
LEDGER=/tmp/credit-desk/my-event/ledger.json

# 1. Init with your gates (mix any of: approved, checked-in, feedback)
node "$SCRIPT" init --ledger "$LEDGER" --event codex-lima --luma-event-id evt-xxxx --require checked-in,feedback

# 2. Load guests (Luma API when LUMA_API_KEY is set, automatic CSV fallback otherwise) + credits
LUMA_API_KEY=... node "$SCRIPT" sync-luma --ledger "$LEDGER" --fallback-csv ~/Downloads/guests.csv
node "$SCRIPT" import-credits --ledger "$LEDGER" ~/Downloads/credits.csv --reserve 5

# 3. Audit duplicates, assign atomically, and dispatch
node "$SCRIPT" audit --ledger "$LEDGER"
node "$SCRIPT" assign --ledger "$LEDGER" --commit
node "$SCRIPT" export --ledger "$LEDGER" --out /tmp/credit-desk/my-event/dispatch.csv --mark-sent
```

## Skills included

| Skill | What it does |
|---|---|
| [luma-credits](skills/luma-credits) | Luma API / CSV sync, optional feedback gate, Gmail/ChatGPT anti-abuse dedupe, reserve pool burn/replace, idempotent CSV or Resend dispatch. |
| [luma-triage](skills/luma-triage) | Rank a Luma guest export into an approve list for remaining spots, with GitHub/web evidence labels and red-flag detection. |
| [codex-event-ops](skills/codex-event-ops) | End-to-end operational checklist for Codex Community events (Luma setup, overbooking math, food/swag ratios, venue/outlets/security preflight, Reimbi & credits timelines, recap). |

## Install as agent skills (Codex / Claude Code)

```bash
git clone git@github.com:crafter-station/event-ops.git ~/Programming/crafter-station/event-ops
for s in luma-triage luma-credits codex-event-ops; do
  ln -s ~/Programming/crafter-station/event-ops/skills/$s ~/.claude/skills/$s   # Claude Code
  ln -s ~/Programming/crafter-station/event-ops/skills/$s ~/.agents/skills/$s   # Codex and others
done
```

## Guest data safety

Luma exports, credits CSVs, dispatch CSVs, and `ledger.json` contain PII and single-use codes. Keep them outside git (`/tmp/credit-desk/<event>/`). `.gitignore` blocks CSV and JSON files, but never store event data inside the repo.
