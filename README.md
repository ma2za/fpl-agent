# fpl-agent

Version: `0.0.22`

`fpl-agent` is an open-source, recommendation-only Fantasy Premier League workspace for coding agents and developers.

The repo is designed so a coding agent can read the squad config, FPL rules, public FPL API data, news notes, generated outputs, and methodology docs, then author recommendations for a human manager to apply manually.

## Vision

`fpl-agent` is intended to become a durable, local player-intelligence workspace rather than a collection of gameweek-only snapshots. Repeated refreshes will accumulate official performance, public news, role evidence, source coverage, and historical revisions for every active FPL player in an ignored local SQLite store.

The evidence history will preserve canonical source URLs, publishers, publication and retrieval times, content hashes, adapter versions, credibility, relevance, disagreement, and missing coverage. Official FPL performance will cover the full active player pool; public-web research will record explicit coverage for every player, including completed searches that find no relevant report.

Before selecting a final squad, the coding agent must use repository tools to inspect a current dossier for every selected player and cite the exact stored evidence used. Deterministic tools may collect, normalize, compare, and reject unsupported decisions, but they must never select the final squad. The project remains public-source, read-only with respect to FPL, free of authenticated FPL access, and dependent on the human manager to apply every accepted action manually.

Continuous updates mean cumulative, idempotent ingestion whenever `pnpm refresh` runs. No background daemon or hosted scheduler is planned.

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
human or coding agent starts a refresh
official data for every active player is fetched and appended to the local evidence store
an all-player public-news research worklist is generated
coding agent searches the public web and ingests cited findings and coverage
current player dossiers are built from stored news, evidence, and performance
manual squad config or public manager data is read
rules and methodology are applied
coding agent inspects every selected player's dossier and authors recommendation files
verification checks legality, freshness, and exact stored evidence references
human reads manual-checklist.md
human manually applies accepted changes in FPL
later refreshes append final performance and postmortems compare frozen decisions to outcomes
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
pnpm benchmark:player-store
pnpm refresh -- --gw auto
pnpm player-store:status
pnpm evidence:worklist -- --gw auto
pnpm evidence:discover -- --gw 1 --min-appearance 0.8
pnpm evidence:review-queue -- --gw 1 --limit 100
pnpm evidence:review -- --gw 1 --input path/to/review.json
pnpm evidence:review-zero -- --gw 1
pnpm archive:freeze -- --gw 1
pnpm outcomes:ingest -- --gw 1 --finalized
pnpm calibration:report
pnpm regret:report -- --gw 1
pnpm model:govern -- --action register --input path/to/model.json
pnpm player:dossier -- --player 1 --gw 1
pnpm fetch:data
pnpm fetch:pl-fixtures -- --gw 1 --horizon 6
pnpm evidence -- --gw 1
pnpm odds -- --gw 1
pnpm set-pieces -- --gw 1
pnpm team-news -- --gw 1
pnpm minutes -- --gw 1
pnpm roles -- --gw 1
pnpm public-evidence -- --gw 1
pnpm fixtures -- --gw 1 --horizon 6
pnpm recommend -- --gw auto
pnpm squad:utility -- --gw 1 --thresholds 40,50,60
pnpm simulate:structures -- --input path/to/simulation-request.json --out path/to/report.json
pnpm counterfactuals -- --request path/to/optimization-request.json
pnpm concentration -- --graph path/to/graph.json --scenarios path/to/scenarios.json --counterfactuals path/to/counterfactual-set.json --players path/to/players.json --out path/to/output
pnpm compare:squads -- --a path/to/a.json --b path/to/b.json
pnpm variant:list -- --gw 1
pnpm variant:verify -- --gw 1 --variant balanced
pnpm variant:compare -- --gw 1 --a balanced --b alternate
pnpm verify -- --gw 1
pnpm postmortem -- --gw 1
```

`pnpm dev` starts the read-only website.

`pnpm refresh -- --gw {n|auto}` fetches shared public FPL inputs once, fetches every active player's public element summary with six workers and bounded retries, appends official evidence to the staged SQLite store, builds evidence in an isolated staging directory, and atomically promotes the gameweek and database together. Add `--offline` to prohibit network access and reuse validated summary caches. Required failures restore both prior targets; exhausted player-summary requests become explicit coverage gaps rather than aborting the refresh.

`pnpm player-store:status` validates the ignored local SQLite store and reports its schema, latest official run, discovery progress, pending candidate reviews, and observation counts.

`pnpm evidence:worklist -- --gw {n|auto}` materializes the current all-player research worklist for inspection. The authoritative worklist remains in SQLite.

`pnpm evidence:discover -- --gw {n}` scans the maintained UK football-news seed and searches matching worklist players through the `google-news-api` package using Google News RSS over the preceding 14 days. The default runs eight bounded Google News workers and commits every 25 players; completed searches are skipped on the next run so interrupted discovery resumes from SQLite. Use `--source-concurrency {1..16}`, `--news-concurrency {1..16}`, `--batch-size {1..100}`, or `--max-players {n}` to bound a pass, and `--no-resume` only to deliberately repeat completed searches. Repeat `--player {id}` for a focused review set, `--include-player {id}` to union priority players into a threshold set, `--min-appearance {0..1}` for the current appearance model, or `--min-prior-start {0..1}` to bootstrap news discovery from the preceding frozen deadline start probabilities. Search runs, receipts, and candidate articles are written directly to the player-intelligence SQLite database. The maintained-source crawl uses a declared per-site fetch, Playwright, or fetch-then-Playwright strategy, respects robots rules, uses configured public feeds where available, and records blocked sources. Run `uv sync` once to install the Python news dependency. Use `--source {id}` to test selected crawl adapters and `--max-pages-per-source {n}` to bound each crawl.

`pnpm evidence:review-queue -- --gw {n} [--limit {n}]` writes a resumable JSON and Markdown queue from every discovery checkpoint in the active worklist. The configured submitted squad is first, followed by named alternatives, transfer targets, high-appearance players, and the remaining worklist. Add repeated `--selected`, `--alternative`, `--transfer-target`, or `--appearance` player IDs to override those priority sets.

`pnpm evidence:review -- --gw {n} --input {review.json}` persists explicit rejected, duplicate, irrelevant, or deferred candidate outcomes. Accepted articles must be supplied as root-source documents with player observations; stale, undiscovered, player-mismatched, duplicate, or observation-free documents are rejected. Each batch rebuilds affected dossiers plus the shared dossier index and readiness report without creating a new official-data worklist.

`pnpm evidence:review-zero -- --gw {n} [--reviewed-zero-player {id}]` writes reviewed zero-result or blocked coverage directly to SQLite from the latest stored discovery. Unreviewed candidates remain separate from trusted source documents and observations.

`pnpm archive:freeze -- --gw {n}` recursively copies and hashes every retained gameweek artifact, including observations, assumptions, projections, scenarios, candidates, simulations, triggers, and decisions. The source refresh must predate the official deadline. A gameweek can be frozen only once; later runs verify every archived hash and reject replacement content.

`pnpm outcomes:ingest -- --gw {n} --finalized` appends official live-gameweek results after the archive exists. Repeated input is idempotent. Late score corrections create player-level revisions linked to the prior outcome; blanks, doubles, postponements, and missing results remain explicit. Use `--input {batch.json}` for a prepared revision batch.

`pnpm calibration:report` derives row-level forecast errors and position, role-evidence, source-coverage, adapter-version, model-version, and probability-band cohorts from frozen forecasts and the latest finalized outcomes. Reports remain descriptive. Parameter-change review is blocked below 100 eligible player-gameweek rows and never changes a model automatically.

`pnpm regret:report -- --gw {n}` scores only the submitted team and legal candidates retained before the deadline. It applies transfer hits, captain fallback, chips, and formation-safe automatic substitutions, then reconciles the frozen-best-to-agent decision path separately from manager overrides. Missing candidate frontiers remain explicit evidence gaps; the command never introduces hindsight-only players.

`pnpm model:govern -- --action register|replay|propose|review|adopt|rollback --input {file}` maintains versioned model parameters and archive replays. Proposals require at least 100 calibrated observations, declared cohorts, expected benefit, rollback criteria, and base/target replays against the same archive. Adoption requires a separately stored coding-agent approval, while rollback preserves the rejected version and also requires shared-archive replay evidence.

`pnpm player:dossier -- --player {id|name} --gw {n} [--at {timestamp}]` writes deterministic JSON and Markdown dossiers from the stored official snapshots, fixtures, performance, source documents, news, role observations, coverage, disagreements, revisions, and gaps.

`pnpm fetch:data` fetches public FPL API data, writes raw cache files, writes timestamped snapshots, and writes normalized player data.

`pnpm fetch:pl-fixtures -- --gw {n} --horizon {n}` fetches the official Premier League fixture release and writes current-season fixture evidence. It does not provide FPL prices, player IDs, deadlines, or availability.

`pnpm evidence -- --gw {n}` writes a compact evidence freshness report for current FPL data, fixtures, team news, set pieces, odds, historical minutes, current roles, and public browser evidence.

`pnpm odds -- --gw {n}` fetches the public Football-Data fixtures CSV and writes an odds coverage report. It records match-level win/draw/loss and over/under evidence when rows are available, but it does not provide player anytime-scorer odds or direct clean-sheet markets.

`pnpm set-pieces -- --gw {n}` writes an automated set-piece report from public FPL role-order fields. It does not select players.

`pnpm team-news -- --gw {n}` writes an automated team-news report from public FPL availability fields. It does not scrape news sites or select players.

`pnpm minutes -- --gw {n}` writes a minutes risk report from public FPL historical minutes and availability fields. Predicted-lineup coverage is marked unavailable until a public source adapter is added.

`pnpm roles -- --gw {n}` writes current-role evidence separately from historical minutes. Configurable adapters cover official availability, explicit manager confirmation, official club evidence, preseason lineups, predicted lineups, and reviewed manual evidence. Missing and failed adapters remain visible, and historical-only evidence cannot produce `READY`.

`pnpm public-evidence -- --gw {n}` captures read-only public evidence pages for fixtures, player news, official Premier League Scout articles, predicted lineups, and price-risk context. It uses Playwright when available and otherwise falls back to plain public HTTP. It does not log in, persist cookies, click FPL management controls, or select players.

For rendered-page capture, install the browser once with `corepack pnpm exec playwright install chromium`, then run `pnpm public-evidence -- --gw {n} --mode browser`.

`pnpm fixtures -- --gw {n} --horizon {n}` writes the existing fixture ticker plus attack/defence horizon evidence for 1GW, 3GW, and 6GW. The horizon report exposes raw FDR, source-backed strength inputs, fallbacks, blanks, doubles, unresolved schedules, congestion, fixture swings, and squad or variant exposure without altering recommendations.

`pnpm recommend -- --gw {n}` prepares evidence for the coding agent. It does not select players or write a final recommendation.

`pnpm squad:utility -- --gw {n}` writes role-adjusted squad utility, downside, bench-cost, formation-coverage, and exact expected automatic-substitution metrics for an authored recommendation. Use `--previous path/to/recommendation.json` to write the immediately preceding draft delta.

`pnpm simulate:frontier -- --input {file} --out {file}` simulates every persisted deterministic candidate without deduplication or truncation. It models shared Poisson match goals, team attack states, shared clean sheets, appearance states, formation-safe automatic substitutions, captain doubling, and vice-captain fallback. Version `0.0.22` reports retain every manager and field candidate definition, every player and fixture input, and every per-sample candidate score so the run is fully replayable from its seed. Add `sensitivityPlayerIds` to the request and `--margins-out {file}` to calculate the player-mean break-even points that flip the leading decision; the margin artifact retains the base simulation and every perturbation simulation. Expected-points mode excludes ownership entirely; rank-aware modes use field weights only through simulated competing scores. The report never selects a structure, and recommendation verification rejects discarded or unsimulated candidates and incomplete MILP optimality proofs.

`pnpm counterfactuals -- --request {file}` uses the local HiGHS mixed-integer solver to prove the exact k-best legal frontier for each requested scenario and GW1, GW1-GW3, or GW1-GW6 horizon. `topCandidateLimit` controls how many of the best 1 to 1,000 deterministic candidates are generated; every generated candidate is persisted for probabilistic reranking. Requests support player inclusion and exclusion, budget, availability, club exposure, premium, premium-defence, bench-depth, and formation constraints. Outputs are neutral candidate, proof, Pareto, and comparison evidence and never select a final structure.

See `docs/counterfactual-optimization.md` for the request format.

`pnpm concentration` recalculates independently optimized candidates under shared strong, baseline, and weak club scenarios. It reports covariance, concentration, correlated p10, downside contribution, scenario regret, and a separately disclosed configurable concentration penalty without selecting a candidate.

See `docs/concentration-analysis.md` for the input format.

`pnpm compare:squads` compares two agent-authored recommendation files and prints or writes a decision report.

`pnpm variant:list`, `pnpm variant:verify`, and `pnpm variant:compare` manage authored alternatives under `gw-{n}/variants/{slug}/`. Variant verification reuses shared gameweek evidence and the same legality, quality, strategy, freshness, and risk checks as the primary recommendation. Comparison reports remain neutral, expose unavailable evidence explicitly, and never select a variant.

`pnpm verify -- --gw {n}` re-validates an agent-authored recommendation and weekly strategy, rewrites the legality report, brief, checklist, and risk report, and exits non-zero when the recommendation is missing, illegal, lacks an explicit optimization objective, discards or skips a generated candidate, lacks complete MILP optimality proofs, uses club coverage as a player-pick reason, uses ownership outside a cited rank simulation, claims an unquantified model override, lacks required rationale or pick-versus-alternative analysis, or lacks completed current research coverage for a selected player. Publication requires five distinct relevant public-news articles across the selected squad, published within the preceding 14 days.

Postmortem commands are placeholders until later milestones implement those workflows.

## Configuration

Manual squad config is the default source of truth.

- `config/squad.ts` contains the editable squad shape.
- `config/manager.ts` documents optional public manager ID support for later milestones.
- `config/risk-profile.ts` stores risk preferences for future recommendation logic.
- `config/current-role.ts` configures public and reviewed current-role evidence adapters.

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

Scripts must not choose the squad, starting XI, captain, vice-captain, bench order, transfers, or chips. Those decisions belong to the coding agent after it reviews the evidence.

Agent-authored recommendations use schema v2 with `artifactKind: "agent_decision"`, coding-agent authorship metadata, and a deterministic competition-state context. Tool evidence and candidate artifacts have separate kinds and cannot pass final recommendation verification. Legacy v1 artifacts remain readable but cannot pass as newly authored decisions.

Schema-v2 decisions also carry a claim ledger with stable source, observation, fact, assumption, transformation, and decision IDs. Verification rejects orphaned or circular lineage, generated reports remain transformations rather than independent sources, and corroboration is counted by originating publisher and claim.

Every authored recommendation must include `decisionAnalysis`: full-squad structure comparisons, why each selected player was picked, which alternatives were rejected, why those alternatives lost, captaincy comparisons, and key omissions. `pnpm verify` fails recommendations that do not include this analysis or fail to state whether projected points include captaincy.

Evidence includes `projection-summary.md`, `budget-tiers.json`, `club-exposure.json`, `captain-candidates.json`, and `decision-prompts.md`. GW1 projections consume position-specific attack and defence difficulty from the fixture-horizon report. Captain evidence retains every eligible starter, and player comparisons retain every configured alternative with a tolerance scaled from both projection distributions.

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

- The repo prepares deterministic evidence files and seeded appearance-state distributions from cached FPL data.
- The repo validates squads, formations, captaincy, bench order, chips, deadlines, and transfer costs.
- The repo generates role-adjusted projections while retaining legacy conditional projections for comparison.
- The repo can hold a season strategy and verify weekly strategy rationale.
- Public odds coverage depends on Football-Data fixture rows being available for the target gameweek.
- Player selection is intentionally agent-authored, not script-authored.
- The repo captures selected public evidence pages, including official Premier League Scout articles, but does not log in or scrape authenticated FPL pages.
- Public manager endpoints exist in the API client but are not wired into recommendation flow yet.
- Venue-specific FPL attack/defence strengths can be unavailable or zero; horizon evidence then labels lower-confidence overall-strength or raw-FDR fallbacks instead of treating zero as real strength.

## Project Status

See `docs/roadmap.md`.
