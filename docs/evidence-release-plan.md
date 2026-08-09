# Evidence Automation Status

This document records the evidence capabilities currently implemented in `fpl-agent`. It contains no planned releases.

## Decision Boundary

Evidence scripts collect, normalize, summarize, and validate information. They do not select the final squad, starting XI, captain, vice-captain, bench order, transfer, or chip.

The coding agent authors recommendations after reviewing evidence. The human manager applies accepted changes manually in the official FPL interface.

## Shared Evidence Model

Implemented:

- Evidence source identifiers, providers, URLs, local paths, confidence, and freshness.
- Fresh, stale, and missing classifications.
- Required-source missing and stale counts.
- Evidence items with area, subject, severity, confidence, timestamp, and URL.
- JSON and Markdown evidence reports.
- Freshness warnings copied into recommendation verification.

## FPL Data

Implemented:

- Public bootstrap, fixture, player-summary, and live-gameweek endpoints.
- Zod validation for the primary public responses.
- Raw JSON caches and timestamped bootstrap/fixture snapshots.
- Normalized player identity, team, position, price, status, availability, expected points, form, minutes, ownership, and total points.
- Transactional refresh fetches bootstrap and fixtures once and normalizes the shared player set once.
- Validated offline refresh from local bootstrap and fixture caches, with stale inputs identified explicitly.

Current limitations:

- Public manager endpoints are returned as unknown data.
- Individual source commands remain non-transactional when run outside the shared refresh command.

## Transactional Refresh

Implemented:

- One `refresh` command for decision evidence, fixtures, availability, set pieces, minutes, odds, public evidence, and the aggregate evidence report.
- Isolated staging directories and validation before atomic gameweek promotion.
- Required and optional stage classification.
- Preservation of the previous valid gameweek directory after required-stage, validation, interrupted-write, or input-publication failures.
- Bounded stage concurrency with one shared in-memory FPL input set.
- Offline mode that performs no network requests.
- A local `refresh-manifest.json` containing run mode, deadline state, input freshness and hashes, stage status and duration, artifact hashes, and failures.

## Team News and Availability

Implemented:

- `team-news-report.json` and `team-news-report.md`.
- FPL availability status, playing chance, news text, and news timestamp.
- `info`, `watch`, `risk`, and `avoid` severity.
- Selected-player flags when an authored recommendation exists.
- Source freshness and warnings.

Current limitations:

- Official club, BBC, and predicted-lineup sources are not normalized into the team-news report.
- Public page captures require agent interpretation when they do not map cleanly to players.

## Set Pieces

Implemented:

- `set-pieces-report.json` and `set-pieces-report.md`.
- Penalty, direct-free-kick, corner, and indirect-free-kick order fields.
- Selected-player flags, role confidence, and source freshness.
- Risk-report and verification visibility for selected-player assumptions.

Current limitations:

- FPL role order is evidence, not confirmation that the player will start or retain the role.

## Odds

Implemented:

- `odds-report.json` and `odds-report.md`.
- Public Football-Data fixture CSV ingestion.
- Match win/draw/loss and over/under probabilities when rows match.
- Clearly labelled derived attack and clean-sheet signals.
- Separate source freshness and market coverage.
- Local public snapshot support in the report model.
- Selected-team coverage and unmatched-fixture warnings.

Current limitations:

- The source does not guarantee direct clean-sheet, team-goal, or anytime-scorer markets.
- Missing markets remain coverage gaps even when the source file is fresh.

## Minutes and Lineup Risk

Implemented:

- `minutes-risk-report.json` and `minutes-risk-report.md`.
- Historical FPL minutes and availability inputs.
- `secure`, `watch`, `risky`, and `unknown` classifications.
- Selected starter and bench-position context.
- Historical confidence separated from predicted-lineup confidence.
- Verification and web visibility for selected-player minutes risk.

Current limitations:

- Predicted-lineup confidence is currently `unavailable` in the normalized report.
- Historical minutes do not confirm current tactical role or starter status.

## Current-Role Evidence

Implemented:

- `current-role-report.json`, `current-role-report.md`, and `adapter-coverage-report.json`.
- Root source records and observations for official availability, manager and club evidence, preseason and predicted lineups, substitution events, transfer reporting, bookmaker markets, and agent evidence assessments.
- Original publisher, canonical URL, publication and retrieval time, excerpt or structured value, adapter version, content hash, and underlying claim ID on every current observation.
- Per-dimension coverage and confidence for historical role, current manager preference, preseason usage, predicted-lineup consensus, availability, squad competition, transfer risk, and set-piece role.
- Reliability hierarchy with 14-day current and 60-day historical half-life decay.
- Reviewed manual overrides, dimension-local source disagreement, publisher-and-claim deduplication, and visible missing or failed adapters.
- A historical-only confidence cap of `0.45`; historical evidence alone cannot produce `READY`.
- Per-dimension evidence confidence remains separate from player-level start probability; player-level appearance states are published in the probabilistic projection artifacts.
- Adapter health metrics for configured, fetched, parsed, matched, stale, failed, and unsupported inputs.
- Transactional refresh, recommendation prompts, aggregate evidence, and squad-risk integration.

Current limitations:

- Non-FPL adapters require coding-agent-authored root observations; public page text is not silently mapped to player roles.
- Current-role status is evidence for the coding agent and does not select a player or starting XI.

## Public Evidence Capture

Implemented:

- `public-evidence-report.json` and `public-evidence-report.md`.
- Read-only public page collection for fixtures, news, predicted-lineup context, prices, and general news.
- Official Premier League Scout pages in the default source set.
- Playwright capture when available and public HTTP fallback.
- URL, provider, timestamp, capture mode, title, excerpt, word count, confidence, and errors.
- Raw text snapshots under ignored source directories.
- Failed and low-text captures represented as warnings.

Safety:

- No login.
- No persisted FPL cookies.
- No authenticated FPL management pages.
- No clicks on team-management controls.
- No player selection.

## Fixture and Structure Evidence

Implemented:

- Fixture ticker generation for a configurable horizon.
- Attack- and defence-specific 1GW, 3GW, and 6GW fixture horizons with source confidence and explicit fallbacks.
- Blank, double, unresolved-schedule, short-rest, fixture-swing, configured-squad, and authored-variant exposure summaries.
- Official Premier League fixture-release parsing.
- Legacy conditional and role-adjusted player projections, position pools, budget tiers, and club exposure.
- `probabilistic-projections.json`, `projection-uncertainty-report.json`, and `projection-uncertainty-report.md`.
- Mutually exclusive start, substitute, and no-appearance probabilities with normalized invariants.
- Conditional-start and substitute point values, expected minutes distributions, median, p10, p90, standard deviation, and role-adjusted expectation.
- Separate historical-role, current-role, availability, overall evidence confidence, evidence uncertainty, and football-outcome variance.
- Deterministic seeds and persisted model inputs.
- Empirical conditional histories when sufficient, with labeled position, price, fixture, and role cohorts otherwise.
- Squad comparison for two authored recommendation files.
- Authored variant listing, independent verification, and neutral comparison against shared gameweek evidence.
- Full-squad structure comparison requirements in recommendation quality gates.
- Warnings for overfunded benches, fixture-exposure gaps, projection-scope ambiguity, and confidence overstatement.

Current limitations:

- Appearance states are player-independent; correlated club and scenario states are deferred to `0.0.15`.
- Preseason current-season match histories are usually empty, so cohort fallbacks are common and explicitly labeled.
- FPL attack and defence strength fields may be unavailable; venue-specific overall strength and raw FDR remain visibly labelled low-confidence fallbacks.
- Official Premier League fixture-release evidence remains separate and is never silently merged with the FPL schedule.
- Price-risk comparison remains unavailable until normalized price evidence exists; reports expose that gap explicitly.

## Recommendation and Strategy Quality

Implemented:

- Evidence-only recommendation templates.
- Schema-v2 tool evidence and candidate contracts that cannot parse as final decisions.
- Schema-v2 coding-agent decision contracts with required authorship and competition context.
- Legacy v1 artifact read compatibility without final-verification eligibility.
- Stable claim-ledger IDs for sources, observations, facts, assumptions, transformations, and decisions.
- Publisher, source type, observation and retrieval time, reliability, freshness, model version, and upstream lineage.
- Orphan and cycle rejection at schema and final-verification boundaries.
- Publisher-and-claim source-independence counts that do not treat derived reports as corroboration.
- Legacy recommendation provenance adaptation without invented lineage.
- Claim-ledger v3 with explicit observation, derived-fact, assumption, forecast, and decision kinds.
- Forecast lineage covering model identity, version, facts, assumptions, output, uncertainty, and horizon.
- Structured language findings for evaluative facts, unsupported causality, ownership-as-safety, and historical-minutes guarantees.
- Phase-aware suppression of preseason price-movement and transfer-hit warnings.
- Read compatibility for claim-ledger v1 and v2 without inferred epistemic kinds.
- Agent-authored weekly recommendations and weekly strategy.
- Evidence references by decision area.
- Player-by-player pick and alternative analysis.
- Full-squad structure comparisons.
- Captaincy comparisons and key omission analysis.
- Legality, rationale, risk, confidence, projection-scope, and strategy checks.
- Generated risk report, legality report, agent brief, and manual checklist.

Current limitations:

- Scripts do not and must not author final selections.
- Missing public evidence can cap confidence but cannot be eliminated automatically.

## Commands

```bash
pnpm refresh -- --gw <n|auto> [--offline]
pnpm fetch:data
pnpm fetch:players -- --player <id|name> [--player <id|name> ...]
pnpm fetch:players -- --gw <n>
pnpm fetch:pl-fixtures -- --gw <n> --horizon <n>
pnpm evidence -- --gw <n>
pnpm odds -- --gw <n>
pnpm set-pieces -- --gw <n>
pnpm team-news -- --gw <n>
pnpm fixtures -- --gw <n> --horizon <n>
pnpm minutes -- --gw <n>
pnpm roles -- --gw <n> [--input <agent-role-evidence.json>]
pnpm public-evidence -- --gw <n>
pnpm fixtures -- --gw <n> --horizon <n>
pnpm recommend -- --gw <n|auto>
pnpm compare:squads -- --a <file> --b <file>
pnpm variant:list -- --gw <gameweek>
pnpm variant:verify -- --gw <gameweek> --variant <slug>
pnpm variant:compare -- --gw <gameweek> --a <slug> --b <slug>
pnpm verify -- --gw <n>
```

All commands are local and read-only with respect to the user's FPL team.
