# fpl-agent

Version: `0.0.1`

`fpl-agent` is an open-source, recommendation-only Fantasy Premier League workspace for coding agents and developers.

The repo is designed so Codex, Claude Code, or a developer can read the squad config, FPL rules, public FPL API data, news notes, generated outputs, and methodology docs, then produce manual recommendations for a human manager.

## What It Is

- A TypeScript pnpm monorepo.
- A local, forkable workspace for FPL analysis.
- A read-only recommendation system.
- A place to store squad config, FPL data, generated recommendations, manual checklists, and postmortems.
- A workflow for coding agents to inspect facts and write decision files.

## What It Is Not

- It is not an FPL bot that submits changes.
- It does not log into Fantasy Premier League.
- It does not use browser automation.
- It does not submit transfers, captaincy, bench order, chips, or team selection.
- It does not require OpenAI, Claude, or any provider API key.

All FPL changes must be applied manually by the human manager inside the official FPL interface.

## Safety Boundary

The project must never implement:

- FPL login
- Session cookies
- Authenticated FPL actions
- POST requests that change an FPL team
- Playwright or Selenium automation against FPL
- Automatic transfer submission
- Automatic team-selection submission

Generated recommendations are instructions for a human, not executable FPL actions.

## Intended Workflow

```txt
cron or human starts analysis
public FPL API data is fetched
manual squad config or public manager data is read
rules and methodology are applied
evidence files are written
Codex, Claude Code, or a developer reviews facts and news
the agent authors recommendation files
human reads manual-checklist.md
human manually applies accepted changes in FPL
postmortem compares recommendation to actual outcome
```

## Install

```bash
pnpm install
```

## Commands

```bash
pnpm dev
pnpm test
pnpm fetch:data
pnpm recommend -- --gw auto
pnpm verify -- --gw 1
pnpm postmortem -- --gw 1
```

`pnpm dev` starts the read-only website.

`pnpm fetch:data` fetches public FPL API data, writes raw cache files, writes timestamped snapshots, and writes normalized player data.

`pnpm recommend -- --gw {n}` prepares evidence for the coding agent. It does not select players or write a final recommendation.

`pnpm verify -- --gw {n}` re-validates an agent-authored recommendation, rewrites the legality report, and exits non-zero when the recommendation is missing, illegal, or missing required rationale.

Postmortem commands are placeholders until later milestones implement those workflows.

## Configuration

Manual squad config is the default source of truth.

- `config/squad.ts` contains the editable squad shape.
- `config/manager.ts` documents optional public manager ID support for later milestones.
- `config/risk-profile.ts` stores risk preferences for future recommendation logic.

No private FPL credentials belong in this repo.

## Environment

Copy `.env.example` if needed.

```bash
NEXT_PUBLIC_SITE_URL=
FPL_MANAGER_ID=
```

There are no LLM provider keys.

## FPL API Usage

`packages/fpl-api` uses public Fantasy Premier League API endpoints as the source of truth for players, teams, fixtures, deadlines, and live gameweek data.

Required public endpoints are documented in `docs/fpl-api.md`.

`pnpm fetch:data` writes:

```txt
data/raw/bootstrap-static.json
data/raw/fixtures.json
data/raw/live/gw-{gameweek}.json
data/raw/snapshots/{timestamp}/bootstrap-static.json
data/raw/snapshots/{timestamp}/fixtures.json
data/processed/players.json
```

## Recommendations

`pnpm recommend -- --gw {n}` evidence output lives under:

```txt
packages/content/recommendations/gw-{n}/
```

For coding-agent review, start with `agent-brief.md`. It lists the evidence files and current judgment checks before the agent authors a final recommendation.

Scripts must not choose the squad, starting XI, captain, vice-captain, bench order, transfers, or chips. Those decisions belong to Codex, Claude Code, or a human developer after reviewing the evidence.

Evidence includes `projection-summary.md`, `budget-tiers.json`, `club-exposure.json`, and `decision-prompts.md`.

Large derived evidence JSON files are ignored by git. Regenerate them locally with `pnpm recommend -- --gw {n}`.

Manual context notes live under:

```txt
packages/content/context/
```

## Verification

`pnpm verify -- --gw {n}` validates agent-authored recommendation files before a manual checklist is trusted.

It checks squad legality, starting XI, formation, bench order, captaincy, chip availability, transfer cost, deadline status, the manual-execution safety flag, and quality gates for rationale and risk notes.

Invalid recommendations fail loudly and update:

```txt
packages/content/recommendations/gw-{n}/legality-report.json
```

## Cron

Cron should only generate local files. It must not apply FPL changes.

See `docs/cron.md`.

## Website

The website is read-only and displays project state, methodology, recommendations, squad information, and postmortems.

```bash
pnpm dev
```

## Known Limitations

- The repo prepares deterministic evidence files from cached FPL data.
- The repo validates squads, formations, captaincy, bench order, chips, deadlines, and transfer costs.
- The repo can generate deterministic projections and player-pool evidence.
- Player selection is intentionally agent-authored, not script-authored.
- The repo does not ingest FPL news automatically.
- Public manager endpoints exist in the API client but are not wired into recommendation flow yet.

## Roadmap

See `docs/roadmap.md`.
