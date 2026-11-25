---
summary: Checklist for a Codex Community event, from Luma setup to the recap
order: 4
---

# Event playbook

This checklist comes from what Codex Ambassadors reported after their first events and from DevDay Exchange Lima. Work through it in order, starting two weeks before the event.

## 1. Set up Luma before you publish

1. Keep the event private until the copy, venue, cover and questions are final.
2. Turn on Require Approval. Approve people a few at a time every day so early signups know they are in.
3. Never mark the event Sold Out. Keep the waitlist open.
4. Set Guest List to Hidden so attendees cannot message each other.
5. Add a required question for the attendee's ChatGPT email. It often differs from their Luma email.
6. Give volunteers the Check-in Staff role, which hides the guest list and blocks exports.
7. Set up the Luma feedback email before the event starts.

To decide who to approve, run `event-ops triage` and read `event-ops skills get triage`.

## 2. Plan capacity, food and swag

- **Show-up rate.** Expect 50% to 70% of approved guests to come. Approve 25% to 30% more people than the room holds.
- **First event size.** Start with about 50 people in the room, which means 80 to 100 approved. Logistics get much harder above 80.
- **Food.** Order food people share, usually pizza, at about half a pizza per expected attendee. Individual bowls run out and cost more.
- **Swag.** Keep items for everyone, like stickers, apart from raffle prizes. Count prizes against expected attendance, fix the number of winners before you call anyone up, and keep one or two spares.

## 3. Admin and vendors, two weeks to three days before

- **Credits.** Request attendee credits at least 3 business days before the event.
- **Reimbi.** Check that your reimbursement account is active before you spend anything.
- **Payment terms.** Ask venues and food vendors to bill you 14 days after the event, so you are not paying out of pocket while you wait for reimbursement.
- **Partners.** Agree in writing on who handles logistics, speaking, judging and the venue. Only people who share the operational work are co-organizers. Thank venues and partners in the description and the recap, and do not co-brand without approval.

## 4. Venue and door, one week to one day before

- **Power and tables.** For a hands-on session, check outlets, power strips, tables and Wi-Fi capacity in person. Without outlets, laptops die during the build block.
- **Opening remarks.** At a university or company venue, keep the institutional welcome under 5 minutes so it does not eat into building time.
- **Door.** Agree on one entry requirement with venue security, check for other events in the building, put up signs, and put one person on the door for the first 30 to 60 minutes. That person is never the host.
- **Roles.** Assign check-in, a timekeeper, tech support and a photographer with a shot list covering the room, speakers, demos, the group photo and the team.

## 5. Run a 3-hour meetup or workshop

- Start with 15 to 20 minutes of food and networking so late arrivals do not interrupt the first talk.
- Keep talks under 20 to 30 minutes and switch between slides and the Codex app or CLI. Live demos hold attention better than slides.
- Ask community presenters to demo live, without slide decks or recorded videos.
- End with a protected block for building or structured networking.

## 6. Check people in and send credits

Use one tool for check-in and do not merge CSVs by hand during the event.

- Volunteers scan tickets in the Luma app with the Check-in Staff role. Luma's `checked_in_at` becomes the only record of who came.
- After doors close, use `event-ops credits` to sync Luma, apply your gates, block duplicate accounts and send one code per attendee. `event-ops skills get credits` covers the details.

## 7. Wrap up in the next three days

- Get the final numbers from `event-ops credits status`.
- Submit itemized food and drink receipts to Reimbi.
- Post a recap in `#ext-amb-codex-events-recap` with real attendance, the format, photos and one lesson you learned.
