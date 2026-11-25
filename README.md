# event-ops

Send one credit code to every attendee who checked in, from your terminal or your coding agent.

`event-ops` is a CLI for running meetups, workshops and hackathons. It syncs your Luma guests and gives each checked-in attendee exactly one code, even when someone registers twice. It also helps you decide who to approve, and it carries the checklist Codex Ambassadors built from their first events.

It has no dependencies and runs on Node 18+ or Bun. Try the sandbox at https://event-ops.crafter.run.

## Install

```bash
npm i -g github:crafter-station/event-ops      # or bun add -g github:crafter-station/event-ops
event-ops demo                                 # the full credit flow, offline
```

To give the CLI to your coding agent (Codex, Claude Code, Cursor and others), install the skill.

```bash
npx skills add crafter-station/event-ops
```

The skill tells the agent to run `event-ops skills get core`, so its instructions always match the CLI version you installed.

## Event day

```bash
event-ops credits init codex-lima-dec --luma-event-id evt-xxxx
event-ops credits import codes ~/Downloads/codes.csv --reserve 5

# after doors close
event-ops credits sync                  # Luma API with LUMA_API_KEY, or --csv guests.csv
event-ops credits status                # funnel, code pool and duplicate flags
event-ops credits assign --commit       # run it without --commit first to preview
event-ops credits send --from "You <you@domain>" --subject "Your Codex credits" --confirm
```

Without a Resend account, `event-ops credits export --mark-sent` writes a mail-merge CSV instead.

When a code was already redeemed, run `event-ops credits burn attendee@email.com` and then `send --confirm` again. Only the replacement goes out.

## How it keeps codes safe

A claim page on venue Wi-Fi tends to fail at around 200 people, and anyone who knows another guest's email can claim their code. `event-ops` sends codes by email after the event instead.

1. Volunteers check people in with the Luma Check-in Staff role. Luma keeps the only check-in record and the guest list stays hidden.
2. Only guests who pass your gates get a code. The gates are `approved`, `checked-in` and `feedback`, and you choose any mix.
3. Codes go to the verified inbox. Gmail dots and `+tags` count as the same address, and several Luma accounts that share one ChatGPT email get one code between them.
4. Every write to the ledger is atomic. Re-syncing, late check-ins or a send that crashed halfway never assign or email twice, because each send uses a Resend idempotency key and a pending marker.

```text
  Luma API or guests CSV ──┐
  Feedback CSV (optional) ─┼──► local ledger ──► status ──► assign ──► send (Resend) or export (CSV)
  Credit codes + reserve ──┘    ~/.event-ops                 preview     preview until --confirm
```

## Commands

| Command | What it does |
|---|---|
| `credits init <event>` | Create an event ledger and make it current |
| `credits sync [--csv file]` | Pull guests and check-ins from the Luma API or a CSV export |
| `credits import guests\|feedback\|codes <file>` | Import a CSV, with `--reserve N` for codes |
| `credits status` | Show the funnel, the code pool and duplicate flags |
| `credits assign [--commit]` | Plan one code per eligible guest, preview by default |
| `credits burn <email\|code>` | Replace a broken code from the pool or the reserve |
| `credits export [--mark-sent]` | Write a mail-merge CSV of assigned codes not yet sent |
| `credits send --from … --subject … [--confirm]` | Email codes with Resend, preview by default |
| `triage <guests.csv>` | Add GitHub and web evidence to pending signups |
| `events list` and `events use <event>` | Switch between events |
| `skills list` and `skills get <name>` | Print the agent guides bundled in the CLI |
| `schema` | Print the command contract as JSON |

When the output is piped, or with `--json`, every command prints one JSON envelope.

```json
{ "ok": true, "command": "credits status", "data": { "counts": { "eligible": 64 } }, "nextSteps": ["event-ops credits assign"] }
```

Exit code 0 means success, 1 a runtime or upstream failure, 2 a usage error and 3 a missing precondition.

## Environment

| Variable | Used by |
|---|---|
| `LUMA_API_KEY` | `credits sync`, with Luma Plus |
| `RESEND_API_KEY` | `credits send --confirm` |
| `EVENT_OPS_HOME` | Data folder, `~/.event-ops` by default |
| `EVENT_OPS_EVENT` | Default event slug |

## Guest data

Ledgers, guest exports and code CSVs contain personal data and single-use codes. `event-ops` keeps them in `~/.event-ops/events/<slug>/` with `0600` permissions, outside your working folder. Do not commit them.

## Develop

```bash
git clone https://github.com/crafter-station/event-ops && cd event-ops
npm link            # puts event-ops on your PATH from source
npm test
```

MIT. Built by [Crafter Station](https://crafter.run).
