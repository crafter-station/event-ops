# Decisions

## Contract origin

Mixed. The ledger is defined here (guests, codes, gates, pending sends). Luma's `get-guests` API and Resend's `emails` API are the discovered boundary, wrapped in `src/lib/luma-api.mjs` and `credits send`.

## Distribution

Plain ESM with a `node` shebang, no build and no dependencies. It installs from GitHub (`npm i -g github:crafter-station/event-ops`) or `npm link`, and the same tree can be published to npm as `@crafter/event-ops` without changes. Bun runs it unchanged.

## Blocks

cligentic was not adopted. Its blocks are TypeScript, and adding a build step would break the zero-build GitHub install, which is the main install path until npm publishing. The equivalent patterns (TTY detection, NO_COLOR, stderr banner, visible-width tables, JSON envelope, exit codes) live in `src/ui.mjs` and `src/cli.mjs`, about 300 lines.

## Skills

The repo ships one shim skill (`skills/event-ops/SKILL.md`) for `npx skills add`. Full guides live in `skill-data/` inside the package and print with `event-ops skills get <name>`, so an installed skill can never drift from the installed binary.

## Safety, sized to damage

| Risk | Commands | Gate |
|---|---|---|
| none | status, schema, skills, events list, demo, triage | none |
| local | init, sync, import, assign --commit, burn, export | atomic writes, `init` refuses to overwrite without `--force` |
| external | send --confirm | dry-run default, pending marker written before each request, Resend idempotency key per code, unconfirmed sends skipped until `--retry-pending` |

Secrets are read only from the environment. Assignment output never includes code values, only code ids.

## What broke during the rewrite

- `node --test test/` on Node 24 tries to load the directory as a module. The script uses a shell glob.
- Biome's suggested fix for the ANSI regex (`\[` inside a template literal) would have silently turned the escape into a character class. The template now uses `\\[`.
- The previous claim server (v1) had a load-then-save race that handed out 55 duplicate codes in 200 concurrent claims. It was removed before publishing. The CLI is single-process by design. A live claim app must use row locking (`FOR UPDATE SKIP LOCKED`) instead of a JSON file.
