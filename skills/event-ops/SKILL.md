---
name: event-ops
description: Run community tech events with the event-ops CLI. Use when distributing credit or coupon codes to Luma attendees (one per checked-in guest, duplicate emails blocked, reserve codes for broken ones), triaging a Luma guest export into an approve list, or planning, running and wrapping up a Codex Community meetup, workshop or hackathon (Luma setup, food math, Reimbi, credits timeline, recap).
---

# event-ops

This skill is intentionally thin. The real instructions ship inside the CLI, so they always match the installed version.

1. Check the CLI is installed:

   ```bash
   event-ops --version
   ```

   If the command is missing, install it (Node 18+):

   ```bash
   npm i -g github:crafter-station/event-ops
   ```

2. Load the guide and follow it:

   ```bash
   event-ops skills get core
   ```

   Topic guides: `event-ops skills list`, then `event-ops skills get <name>` (`credits`, `triage`, `playbook`).

3. For the exact command contract, run `event-ops schema`.
