# Project Status

This document records the capabilities present in the repository. It does not contain planned releases or private maintenance goals.

## Workspace

- TypeScript pnpm monorepo.
- Read-only Next.js application.
- Public FPL API client with validation and local caching.
- Deterministic rules and evidence packages.
- Local content for context, strategy, recommendations, and postmortems.

## Public Data

- Public endpoint constants and URL construction.
- Validated bootstrap, fixture, player-summary, and live-gameweek responses.
- Public manager endpoints exposed as untyped optional reads.
- Raw cache files, timestamped snapshots, and normalized player data.
- Fixture evidence from the FPL API and official Premier League fixture release.

## Rules

- Squad size, position structure, budget, and club limits.
- Starting XI and formation validation.
- Bench membership and order validation.
- Captain and vice-captain validation.
- Basic transfer-cost validation.
- Basic chip availability.
- Deadline and provisional-data checks.

The exact covered and uncovered rule behavior is listed in `docs/rules-coverage.md`.

## Decision Evidence

- Transparent player projections.
- Transfer candidate evidence.
- Captain rankings.
- Starting XI and bench evidence.
- Conservative chip evidence.
- Fixture ticker and squad comparison.
- Strategy templates and quality checks.
- Recommendation templates that require coding-agent or human authorship.

## Evidence Sources

- FPL data freshness and coverage.
- Team availability and news fields from public FPL data.
- Set-piece order fields from public FPL data.
- Historical minutes and selected-player risk.
- Public match-level odds with explicit market coverage.
- Public page capture with Playwright or HTTP fallback.
- Official Premier League Scout pages in the public evidence set.

Detailed present-state coverage is recorded in `docs/evidence-release-plan.md`.

## Verification

- Squad, formation, bench, captaincy, chip, transfer, and deadline checks.
- Recommendation rationale and evidence-reference quality gates.
- Full-squad structure comparisons and player alternative analysis.
- Captaincy alternatives and important omission analysis.
- Projection-scope, confidence, bench-spend, fixture-exposure, and evidence-gap warnings.
- Weekly strategy consistency checks.
- Generated legality, risk, brief, and manual-checklist outputs.

## Website

- Read-only project overview.
- Current GW1 recommendation and risk presentation.
- Squad, methodology, and postmortem pages.

## Operational State

- `pnpm test` passes 24 test files and 99 tests at the `0.0.2` status update.
- Evidence commands write local files for review.
- Final squad, transfer, captaincy, bench, and chip decisions remain agent- or human-authored.
- The human manager performs every change in the official FPL interface.

## Current Limitations

- The recommendation page reads GW1 paths directly.
- Public manager responses are not normalized into recommendation state.
- Evidence refresh is split across multiple commands.
- Predicted-lineup confidence is unavailable unless supported by manually reviewed public evidence.
- Odds coverage depends on public rows and lacks guaranteed direct player markets.
- Projection and transfer-horizon models are intentionally simple.
- Postmortem automation is not implemented.

## Safety Boundary

The repository does not log into FPL, store authenticated FPL cookies, automate management pages, or submit team changes.
