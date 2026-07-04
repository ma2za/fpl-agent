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
Codex, Claude Code, or a developer reviews facts and news
recommendation files are written
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

Recommendation, verification, and postmortem commands are placeholders until later milestones implement those workflows.

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

Future `pnpm recommend -- --gw {n}` output will live under:

```txt
packages/content/recommendations/gw-{n}/
```

The most important file will be `manual-checklist.md`, written for a human who manually applies any accepted changes in FPL.

## Verification

Future `pnpm verify -- --gw {n}` will validate that generated recommendations obey FPL rules before a final manual checklist is accepted.

Invalid recommendations must fail loudly.

## Cron

Cron should only generate local files. It must not apply FPL changes.

See `docs/cron.md`.

## Website

The website is read-only and displays project state, methodology, recommendations, squad information, and postmortems.

```bash
pnpm dev
```

## Known Limitations

- The repo does not generate recommendations yet.
- The repo validates squads, formations, captaincy, bench order, chips, deadlines, and transfer costs.
- The repo can generate deterministic projections, captain rankings, bench order, chip recommendations, and transfer candidates.
- The repo does not ingest FPL news automatically.
- Public manager endpoints exist in the API client but are not wired into recommendation flow yet.

## Roadmap

See `docs/roadmap.md`.
