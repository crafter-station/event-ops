# event-ops

Agent skills for running Crafter Station events, from registration to follow-up. Agent-agnostic: each skill is a folder with a `SKILL.md` and plain Node scripts, usable from Claude Code, Codex, or any agent that reads skill files.

## Skills

- [luma-triage](skills/luma-triage): rank a Luma guest export into an approve list for the remaining spots, with evidence labels and full links.

## Install

Clone the repo and link the skills your agent should see:

```bash
git clone git@github.com:crafter-station/event-ops.git ~/Programming/crafter-station/event-ops
ln -s ~/Programming/crafter-station/event-ops/skills/luma-triage ~/.claude/skills/luma-triage   # Claude Code
ln -s ~/Programming/crafter-station/event-ops/skills/luma-triage ~/.agents/skills/luma-triage   # Codex and others
```

Requirements: Node 18+ or Bun, and `gh` authenticated.

## Guest data

Luma exports and enriched output contain guests' emails and profiles. Keep them outside the repo (`/tmp` or `~/Downloads`). `.gitignore` blocks CSV and JSON, but do not rely on it alone.
