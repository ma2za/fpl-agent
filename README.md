# fpl-agent

Version: `0.0.6`

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
- It does not use browser automation for authenticated FPL management pages.
- It does not submit transfers, captaincy, bench order, chips, or team selection.
- It does not require OpenAI, Claude, or any provider API key.

All FPL changes must be applied manually by the human manager inside the official FPL interface.

## Safety Boundary

The project must never implement:

- FPL login
- Session cookies
- Authenticated FPL actions
- POST requests that change an FPL team
- Playwright or Selenium automation against authenticated FPL management pages
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
pnpm benchmark:fixtures
pnpm refresh -- --gw auto
pnpm fetch:data
pnpm fetch:pl-fixtures -- --gw 1 --horizon 6
pnpm evidence -- --gw 1
pnpm odds -- --gw 1
pnpm set-pieces -- --gw 1
pnpm team-news -- --gw 1
pnpm minutes -- --gw 1
pnpm public-evidence -- --gw 1
pnpm fixtures -- --gw 1 --horizon 6
pnpm recommend -- --gw auto
pnpm compare:squads -- --a path/to/a.json --b path/to/b.json
pnpm variant:list -- --gw 1
pnpm variant:verify -- --gw 1 --variant balanced
pnpm variant:compare -- --gw 1 --a balanced --b alternate
pnpm verify -- --gw 1
pnpm postmortem -- --gw 1
```

`pnpm dev` starts the read-only website.

`pnpm refresh -- --gw {n|auto}` fetches shared public FPL inputs once, builds evidence in an isolated staging directory with bounded concurrency, validates generated artifacts, and atomically promotes a complete gameweek set. Add `--offline` to prohibit network access and use validated caches. Required failures preserve the previous set; stage outcomes remain visible in `refresh-manifest.json` and optional-source gaps remain visible in evidence coverage.

`pnpm fetch:data` fetches public FPL API data, writes raw cache files, writes timestamped snapshots, and writes normalized player data.

`pnpm fetch:pl-fixtures -- --gw {n} --horizon {n}` fetches the official Premier League fixture release and writes current-season fixture evidence. It does not provide FPL prices, player IDs, deadlines, or availability.

`pnpm evidence -- --gw {n}` writes a compact evidence freshness report for current FPL data, fixtures, team news, set pieces, odds, minutes evidence, and public browser evidence.

`pnpm odds -- --gw {n}` fetches the public Football-Data fixtures CSV and writes an odds coverage report. It records match-level win/draw/loss and over/under evidence when rows are available, but it does not provide player anytime-scorer odds or direct clean-sheet markets.

`pnpm set-pieces -- --gw {n}` writes an automated set-piece report from public FPL role-order fields. It does not select players.

`pnpm team-news -- --gw {n}` writes an automated team-news report from public FPL availability fields. It does not scrape news sites or select players.

`pnpm minutes -- --gw {n}` writes a minutes risk report from public FPL historical minutes and availability fields. Predicted-lineup coverage is marked unavailable until a public source adapter is added.

`pnpm public-evidence -- --gw {n}` captures read-only public evidence pages for fixtures, player news, official Premier League Scout articles, predicted lineups, and price-risk context. It uses Playwright when available and otherwise falls back to plain public HTTP. It does not log in, persist cookies, click FPL management controls, or select players.

For rendered-page capture, install the browser once with `corepack pnpm exec playwright install chromium`, then run `pnpm public-evidence -- --gw {n} --mode browser`.

`pnpm fixtures -- --gw {n} --horizon {n}` writes the existing fixture ticker plus attack/defence horizon evidence for 1GW, 3GW, and 6GW. The horizon report exposes raw FDR, source-backed strength inputs, fallbacks, blanks, doubles, unresolved schedules, congestion, fixture swings, and squad or variant exposure without altering recommendations.

`pnpm recommend -- --gw {n}` prepares evidence for the coding agent. It does not select players or write a final recommendation.

`pnpm compare:squads` compares two agent-authored recommendation files and prints or writes a decision report.

`pnpm variant:list`, `pnpm variant:verify`, and `pnpm variant:compare` manage authored alternatives under `gw-{n}/variants/{slug}/`. Variant verification reuses shared gameweek evidence and the same legality, quality, strategy, freshness, and risk checks as the primary recommendation. Comparison reports remain neutral, expose unavailable evidence explicitly, and never select a variant.

`pnpm verify -- --gw {n}` re-validates an agent-authored recommendation and weekly strategy, rewrites the legality report, brief, checklist, and risk report, and exits non-zero when the recommendation is missing, illegal, missing required rationale, or missing pick-versus-alternative analysis.

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

For a fresh Codex or Claude Code chat, create a local `docs/agent-handoff.md`. The file is ignored because it can contain current-season state.

Scripts must not choose the squad, starting XI, captain, vice-captain, bench order, transfers, or chips. Those decisions belong to Codex, Claude Code, or a human developer after reviewing the evidence.

Every authored recommendation must include `decisionAnalysis`: full-squad structure comparisons, why each selected player was picked, which alternatives were rejected, why those alternatives lost, captaincy comparisons, and key omissions. `pnpm verify` fails recommendations that do not include this analysis or fail to state whether projected points include captaincy.

Evidence includes `projection-summary.md`, `budget-tiers.json`, `club-exposure.json`, and `decision-prompts.md`.

Fixture context is generated separately with `pnpm fixtures -- --gw {n} --horizon 6` for FPL API fixtures or `pnpm fetch:pl-fixtures -- --gw {n} --horizon 6` for official Premier League fixture-release evidence.

Strategy context lives under `packages/content/strategy/`. `season-plan.md` sets season posture, while `weekly/gw-{n}.md` and `weekly/gw-{n}.json` hold the agent-authored weekly strategy checked by verification.

The context, season strategy, weekly strategy, recommendation, evidence, and postmortem files are a local season workspace ignored by git. Regenerate evidence with `pnpm recommend -- --gw {n}` and keep the reusable application and packages independent of a particular season.

Manual context notes live under:

```txt
packages/content/context/
```

Rules coverage and known gaps are tracked in `docs/rules-coverage.md`.

## Verification

`pnpm verify -- --gw {n}` validates agent-authored recommendation files before a manual checklist is trusted.

It checks squad legality, starting XI, formation, bench order, captaincy, chip availability, transfer cost, deadline status, the manual-execution safety flag, quality gates for rationale and risk notes, structure comparisons, pick-versus-alternative analysis, projection-scope disclosure, bench spend, confidence calibration, and weekly strategy gates.

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
- The repo can hold a season strategy and verify weekly strategy rationale.
- Public odds coverage depends on Football-Data fixture rows being available for the target gameweek.
- Player selection is intentionally agent-authored, not script-authored.
- The repo captures selected public evidence pages, including official Premier League Scout articles, but does not log in or scrape authenticated FPL pages.
- Public manager endpoints exist in the API client but are not wired into recommendation flow yet.
- Venue-specific FPL attack/defence strengths can be unavailable or zero; horizon evidence then labels lower-confidence overall-strength or raw-FDR fallbacks instead of treating zero as real strength.

## Project Status

See `docs/roadmap.md`.
