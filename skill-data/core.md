---
summary: Start here. The output contract, the safety model and the event-day workflow
order: 1
---

# event-ops: core guide

`event-ops` handles the operations of a community tech event. It helps decide who gets approved, sends each attendee one credit code, and carries the checklist for the night. Each event has a local ledger in `~/.event-ops/events/<slug>/`, which you can move with `EVENT_OPS_HOME`. Event data never goes into the repo you are working in.

## Output contract

- Piped or with `--json`, every command prints one envelope on stdout:
  - success: `{ "ok": true, "command": "credits status", "data": {…}, "nextSteps": ["…"] }`
  - error: `{ "ok": false, "command": "…", "error": { "code": "…", "message": "…", "hint": "…" } }`
- Exit codes: `0` ok, `1` runtime or upstream failure, `2` usage error, `3` precondition not met (no event, missing env var, file not found).
- `nextSteps` tells you what to run next. Prefer it over guessing.
- `event-ops schema` returns every command, flag, risk level and output shape. Read it instead of parsing `--help`.
- `event-ops skills get <name>` always prints Markdown.

## Safety model

| Risk | Commands | Rule |
|---|---|---|
| none | `status`, `schema`, `skills`, `events list`, `demo`, `triage` | run freely |
| local | `init`, `sync`, `import`, `assign --commit`, `burn`, `export` | writes the local ledger only |
| external | `send --confirm` | emails real people; ask the human first |

- `credits assign` and `credits send` are dry-run unless you pass `--commit` / `--confirm`. Always show the human the dry-run output before committing.
- `send` records a pending marker before each email and uses a Resend idempotency key, so a crash never double-emails. Unconfirmed sends are skipped until the human checks Resend and you pass `--retry-pending`.
- Secrets come only from the environment, in `LUMA_API_KEY` and `RESEND_API_KEY`. Never write them to files or pass them as flags.
- Guest exports, code CSVs and ledgers contain personal data and single-use codes. Keep them out of git.

## Event-day workflow (credits)

```bash
event-ops credits init codex-lima-dec --luma-event-id evt-xxxx --require checked-in
event-ops credits import codes ~/Downloads/codes.csv --reserve 5
# after doors close
event-ops credits sync                       # Luma API, or: --csv ~/Downloads/guests.csv
event-ops credits status                     # funnel + duplicate flags
event-ops credits assign                     # dry-run, show it
event-ops credits assign --commit
event-ops credits send --from "Host <host@domain>" --subject "Your Codex credits"            # dry-run
event-ops credits send --from "Host <host@domain>" --subject "Your Codex credits" --confirm  # human approved
```

Without a Resend account, `event-ops credits export --mark-sent` writes a mail-merge CSV to the event folder.

When a code does not work, run `event-ops credits burn attendee@email.com --reason already-redeemed`, then `send --confirm` again. Only the replacement goes out.

## Other guides

- `event-ops skills get credits`: gates, dedupe rules, reserve pool, recovery cases
- `event-ops skills get triage`: turning a Luma pending list into an approve list with evidence
- `event-ops skills get playbook`: end-to-end checklist for a Codex Community event

## Try it

`event-ops demo` runs the full credit flow offline with fake guests.
