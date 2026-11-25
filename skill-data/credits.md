---
summary: One code per attendee who passes your gates, with duplicate blocking, a reserve pool and recovery steps
order: 2
---

# Credits

Send one credit or coupon code to each attendee who passes your gates. It runs locally, with no server to keep alive, for events of 20 to 500 people or more.

## Design

- **Verified inbox.** Codes go to the attendee's Luma email (`--target luma`, default) or the ChatGPT email they registered (`--target chatgpt`). Nobody can claim a code by typing someone else's email.
- **Check-in in Luma only.** Volunteers scan tickets in the Luma app with the **Check-in Staff** role, which hides the guest list. Never split check-in across two tools.
- **Luma API or CSV.** `credits sync` uses `LUMA_API_KEY` (Luma Plus). Without it, pass `--csv` with Luma → Guests → Export.
- **Gates.** `--require` combines `approved`, `checked-in` (default) and `feedback`. Feedback comes from Luma's survey columns or `credits import feedback <form.csv>` (Google Forms, Tally, Typeform).
- **Duplicate accounts.** Gmail dots and `+tags` are canonicalized (`a.b+1@gmail.com` is `ab@gmail.com`), and one ChatGPT email shared by several Luma accounts gets one code. `credits status` shows every flag before you assign.
- **Idempotent.** Every write is atomic. Re-syncing, late check-ins or a resumed send never double-assign or double-email.
- **Reserve pool.** `credits import codes <file> --reserve N` holds N codes back. `credits burn` replaces a broken code from the free pool first, then the reserve.

## Workflow

```bash
event-ops credits init <event> --luma-event-id evt-xxxx --require checked-in,feedback
event-ops credits import codes codes.csv --reserve 5
event-ops credits sync                         # or --csv guests.csv
event-ops credits import feedback form.csv     # only with the feedback gate
event-ops credits status
event-ops credits assign && event-ops credits assign --commit
event-ops credits send --from "Host <host@domain>" --subject "Your credits" [--template email.txt] [--confirm]
```

A template can use `{{name}}`, `{{code}}`, `{{event}}` and `{{email}}`.

## Reading `credits status`

- `counts.eligible` is who passes every gate. If it is far below `checkedIn`, the feedback gate is probably blocking; tell the human before assigning.
- `flags.duplicateCanonicalEmails`: the same inbox registered twice. Only the first gets a code.
- `flags.sharedChatgptEmails`: several Luma accounts claim one ChatGPT account. Only one gets a code.
- `pool.sending > 0`: a previous send never confirmed. Check the Resend dashboard before `--retry-pending`.

## Recovery

| Situation | Do |
|---|---|
| Late check-ins after you assigned | `sync`, then `assign --commit` and `send --confirm` again; only new guests are touched |
| Code already redeemed or invalid | `burn <email-or-code> --reason …`, then `send --confirm` |
| Pool exhausted | `import codes more.csv`, then `assign --commit` |
| Send crashed midway | `status`; re-run `send --confirm`; unconfirmed ones need `--retry-pending` after checking Resend |
| No Resend account | `export --mark-sent` and run a mail merge |

## Do not

- Commit guest CSVs, code CSVs, dispatch CSVs or ledgers.
- Run `assign --commit` or `send --confirm` without showing the human the dry-run first.
