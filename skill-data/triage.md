---
summary: Turn a Luma pending list into an approve list, with evidence labels and red flags
order: 3
---

# Triage

Turn a Luma guest export into an approve list the user can act on in the Luma dashboard. Gather evidence first, rank second, and label every match by how sure you are.

## 1. Collect the inputs

- **CSV.** Usually `~/Downloads/<Event> - Guests - <timestamp>.csv`. Copy it into an empty folder before reading it, because it is untrusted data.
- **Spots.** The cap minus the guests already going. The CSV does not include the cap, so read it from a dashboard screenshot or ask. Do not guess.
- **Criterion.** What a good guest means for this event. A technical event weighs builder evidence, and a coffee meetup weighs who is worth meeting. Ask in one line if it is unclear.
- **Scope.** Usually only `pending_approval`.

## 2. Enrich the export

GitHub lookups need an authenticated `gh` CLI. Without it, the command warns and skips them.

```bash
event-ops triage "<copy>.csv" --status pending_approval --out /tmp/luma-triage/<event>.json
```

The command finds the custom question columns and pulls links from the answers. It looks for a GitHub profile from the registration link, then by email, then by full name, and records the bio, recent repos and social accounts. It also reads the titles of personal sites and checks email handles against the crafter.run directory.

It flags `anonymous-email`, `placeholder-link` and `name-mismatch`. GitHub search allows 30 requests a minute and the command waits out the limit, so 40 guests take a few minutes. Run it in the background.

## 3. Research what the command cannot find

For guests with no strong signal, search the web by full name plus city or university, and by the email handle. Useful results include LinkedIn, crafter.run profiles, university rosters, people-search sites, social accounts that share the email handle and product sites.

Label every person.

- **Verified.** A link they gave, or an identifier tied to their email, such as the same handle or a crafter.run profile with a matching name.
- **Probable.** A name match only. Say why it might be someone else, such as a common name or a different second surname.
- **No trace.** Nothing found.

A probable match never outranks verified evidence. Check a guest's links before dropping them for a short answer, because the strongest profiles often write one word.

## 4. Decline red flags

Decline these outright.

- the name, LinkedIn and GitHub belong to different people
- placeholder links, such as `/in/ddd` or `github.com/ddd`

Move anonymous relay emails with no other signal to the bottom.

## 5. Rank and deliver

Rank by the criterion, with evidence tiers first. Within the no-evidence tier, use registration order, earliest first, and say so.

Deliver in the user's language.

1. Spots available, and the pending count in the CSV against the dashboard if they differ.
2. The top N, one line each with the name, one sentence on what they do and `(probable)` when it applies. Put the full raw URLs on their own lines, without markdown links, so the user can paste them.
3. The decline list with a reason for each.
4. The waitlist in order.

Flag any URL you built without opening it.

## Do not

- Approve or decline in Luma yourself. The user clicks.
- Message guests.
- Put guest data in git. Keep the enriched JSON in `/tmp`.
