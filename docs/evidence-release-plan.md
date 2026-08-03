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
- Player projections, position pools, budget tiers, and club exposure.
- Squad comparison for two authored recommendation files.
- Authored variant listing, independent verification, and neutral comparison against shared gameweek evidence.
- Full-squad structure comparison requirements in recommendation quality gates.
- Warnings for overfunded benches, fixture-exposure gaps, projection-scope ambiguity, and confidence overstatement.

Current limitations:

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
pnpm fetch:pl-fixtures -- --gw <n> --horizon <n>
pnpm evidence -- --gw <n>
pnpm odds -- --gw <n>
pnpm set-pieces -- --gw <n>
pnpm team-news -- --gw <n>
pnpm fixtures -- --gw <n> --horizon <n>
pnpm minutes -- --gw <n>
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
