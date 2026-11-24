---
name: luma-credits
description: Idempotent email-first credit distribution for Luma events. Syncs Luma attendees via LUMA_API_KEY (Luma Plus) or falls back to Luma Guests CSV (free), checks optional feedback gates, blocks duplicate Gmail aliases and shared ChatGPT emails, holds reserve codes for burn/replace, and dispatches 1 unique credit per verified attendee via Resend or mail-merge CSV.
---

# Luma Credits

Zero-infra, crash-proof credit distribution for events of 50 to 500+ attendees. Zero external dependencies (Node 18+ or Bun).

## Design principles

- **Identity travels through the verified inbox**: credits are dispatched to the attendee's verified Luma email (`--target luma`, default) or registration ChatGPT email (`--target chatgpt`). No public claim form to spoof or enumerate.
- **Native Luma check-in**: volunteers scan tickets using Luma's built-in **Check-in Staff** role (which hides the full guest list and keeps `checked_in_at` accurate in one place).
- **Luma Plus API primary, CSV automatic fallback**: uses `LUMA_API_KEY` when available; falls back cleanly to Luma Guests CSV on free plans.
- **Anti-abuse dedupe**: normalizes Gmail dots and `+tags` (`a.b+1@gmail.com` === `ab@gmail.com`) and blocks multiple Luma accounts sharing the same ChatGPT email.
- **Idempotent & resumable**: every state change writes atomically to a local JSON ledger. Re-syncing Luma, adding late check-ins, or resuming a failed Resend batch never double-assigns or double-emails.
- **Reserve pool & burn/replace**: hold back `--reserve N` codes; `burn` marks a broken code and atomically replaces it only if a spare exists.

## Try the 1-second offline demo

```bash
node <skill-dir>/scripts/credit-desk.mjs demo
```

## Event workflow

Keep all CSVs and the ledger outside git (for example `/tmp/credit-desk/<event>/`).

```bash
SCRIPT=<skill-dir>/scripts/credit-desk.mjs
LEDGER=/tmp/credit-desk/codex-lima/ledger.json

# 1. Initialize rules (combine any of: approved, checked-in, feedback)
node "$SCRIPT" init --ledger "$LEDGER" --event codex-lima --luma-event-id evt-xxxx --require checked-in,feedback

# 2a. With Luma Plus token: sync guests + check-ins directly from Luma API v1
LUMA_API_KEY=... node "$SCRIPT" sync-luma --ledger "$LEDGER"

# 2b. Without Luma token (free fallback): pass --fallback-csv or run import-luma
node "$SCRIPT" import-luma --ledger "$LEDGER" ~/Downloads/guests.csv

# 3. Optional: import external feedback CSV (Google Forms, Tally, Typeform)
node "$SCRIPT" import-feedback --ledger "$LEDGER" ~/Downloads/feedback.csv

# 4. Import OpenAI credits CSV (headerless 1-col or named column) and hold 5 in reserve
node "$SCRIPT" import-credits --ledger "$LEDGER" ~/Downloads/credits.csv --reserve 5

# 5. Audit funnel and duplicate-identity flags before assigning
node "$SCRIPT" audit --ledger "$LEDGER"

# 6. Preview assignment (dry-run by default), then commit
node "$SCRIPT" assign --ledger "$LEDGER"
node "$SCRIPT" assign --ledger "$LEDGER" --commit

# 7a. Export ready-to-send CSV (for Gmail mail merge / YAMM / etc.)
node "$SCRIPT" export --ledger "$LEDGER" --out /tmp/credit-desk/codex-lima/dispatch.csv --mark-sent

# 7b. Or dispatch 1-to-1 directly via Resend (dry-run by default; --confirm sends)
node "$SCRIPT" send --ledger "$LEDGER" --from "Host <host@yourdomain.com>" --subject "Your Codex event credits"
RESEND_API_KEY=... node "$SCRIPT" send --ledger "$LEDGER" --from "Host <host@yourdomain.com>" --subject "Your Codex event credits" --confirm
```

## Replacing a broken code

```bash
node "$SCRIPT" burn --ledger "$LEDGER" attendee@email.com --reason "already-redeemed"
```

Then run `export` or `send --confirm` again: only the newly assigned replacement is sent.

## Do not

- Commit Luma CSVs, credits CSVs, dispatch CSVs, or `ledger.json` to git.
- Run `assign --commit` or `send --confirm` before checking `audit` and dry-run output.
