# Roadmap

This document records the capabilities present in the repository and the planned releases from `0.0.9` through `0.0.16`.

## Permanent Decision Boundary

- The repository supplies tools, evidence, calculations, validation, workspace, and guidance.
- Deterministic code may generate legal candidates and counterfactuals, but it must never select or rank the final choice.
- The coding agent makes every FPL decision: squad, transfers, formation, starting XI, bench order, captaincy, chips, decision status, and trigger response.
- The human decides whether to apply the agent's recommendation manually in the official FPL interface.
- Nothing in the repository may authenticate with FPL, retain authenticated cookies, automate management pages, or submit changes.
- Tool-produced evidence and candidate artifacts must remain structurally separate from agent-authored decision artifacts.
- Verification may reject illegal or unsupported decisions, but it must never replace them or choose an alternative.

## Current State: 0.0.9

### Workspace

- TypeScript pnpm monorepo.
- Read-only Next.js application.
- Public FPL API client with validation and local caching.
- Deterministic rules and evidence packages.
- Local content for context, strategy, recommendations, and postmortems.

### Public Data

- Public endpoint constants and URL construction.
- Validated bootstrap, fixture, player-summary, and live-gameweek responses.
- Public manager endpoints exposed as untyped optional reads.
- Raw cache files, timestamped snapshots, and normalized player data.
- Fixture evidence from the FPL API and official Premier League fixture release.

### Rules

- Squad size, position structure, budget, and club limits.
- Starting XI and formation validation.
- Bench membership and order validation.
- Captain and vice-captain validation.
- Season-neutral transfer-cost and chip-availability validation for existing callers.
- Explicit 2026/27 rules for two chip sets, first-half expiry, Free Hit restrictions, and up to five rolled transfers.
- Season-aware transfer hits, chip effects, and selling-price calculations.
- Match and gameweek scoring, including defensive contributions and bonus-point ties.
- Formation-safe automatic substitutions, captain fallback, and chip multipliers.
- Blank and double gameweek aggregation plus provisional and final score states.
- Deadline and provisional-data checks.

The exact covered and uncovered rule behavior is listed in `docs/rules-coverage.md`.

### Decision Evidence

- Transparent player projections.
- Transfer candidate evidence.
- Captain rankings.
- Starting XI and bench evidence.
- Conservative chip evidence.
- Fixture ticker and squad comparison.
- Attack and defence fixture horizons for 1GW, 3GW, and 6GW, including schedule uncertainty, congestion, swings, and squad or variant exposure.
- Authored variant discovery, independent verification, and neutral shared-evidence comparison.
- Strategy templates and quality checks.
- Recommendation templates that require coding-agent authorship.
- Transactional evidence refresh with validated staging, bounded concurrency, offline mode, and atomic promotion.
- Local refresh manifests with source freshness, stage duration, artifact hashes, and visible failures.

### Evidence Sources

- FPL data freshness and coverage.
- Team availability and news fields from public FPL data.
- Set-piece order fields from public FPL data.
- Historical minutes and selected-player risk.
- Public match-level odds with explicit market coverage.
- Public page capture with Playwright or HTTP fallback.
- Official Premier League Scout pages in the public evidence set.

Detailed present-state coverage is recorded in `docs/evidence-release-plan.md`.

### Verification

- Squad, formation, bench, captaincy, chip, transfer, and deadline checks.
- Recommendation rationale and evidence-reference quality gates.
- Full-squad structure comparisons and player alternative analysis.
- Captaincy alternatives and important omission analysis.
- Projection-scope, confidence, bench-spend, fixture-exposure, and evidence-gap warnings.
- Weekly strategy consistency checks.
- Generated legality, risk, brief, and manual-checklist outputs.
- Variant-local legality, risk, brief, checklist, and comparison outputs without final selection.

### Website

- Read-only project overview.
- Current GW1 recommendation and risk presentation.
- Squad, methodology, and postmortem pages.

### Operational State

- The locked local test suite passes 33 test files and 261 tests at the `0.0.9` status update.
- Evidence commands write local files for review.
- Final squad, transfer, captaincy, bench, and chip decisions remain coding-agent-authored.
- The human manager performs every change in the official FPL interface.

### Decision Ownership and Competition State

- Exclusive competition phases and separate deadline proximity.
- Phase-valid action vocabularies, including preseason draft actions.
- Rejection of preseason `roll`, hits, and normal transfers.
- Separate schema-v2 tool evidence, candidate, and coding-agent decision artifacts.
- Required coding-agent authorship and competition context for final verification.
- Read compatibility for legacy v1 recommendation and template artifacts.

### Facts, Assumptions, and Provenance

- Stable typed IDs for sources, observations, facts, assumptions, transformations, and decisions.
- Publisher, source type, timestamps, reliability, freshness, model version, and upstream lineage.
- Semantic rejection of duplicate IDs, orphaned references, and circular dependencies.
- Generated reports represented as transformations instead of independent sources.
- Source independence counted by originating publisher and claim.
- Required fact and assumption dependencies for every referenced agent decision.
- Legacy recommendation adaptation without invented provenance.

### Current-Role Evidence

- Configurable official availability, manager confirmation, club, preseason, predicted-lineup, and reviewed manual adapters.
- Independent normalization of nine historical and current-role evidence dimensions.
- Explicit reliability hierarchy and recency decay for current and historical evidence.
- Reviewed manual override precedence and visible source disagreement.
- Missing and failed adapter coverage retained as first-class output.
- Historical-only confidence capped at `0.45` and prohibited from producing `READY`.

## Delivered Releases

### 0.0.7: Competition State and Decision Ownership

Correct the competition ontology and enforce agent ownership.

- Derive one exclusive competition phase: `PRESEASON_DRAFT`, `LIVE_GAMEWEEK`, `TRANSFER_WINDOW`, `FINAL_LOCKDOWN`, or `SEASON_COMPLETE`.
- Model deadline proximity separately from competition phase.
- Define phase-valid action vocabularies and reject preseason `roll`, hits, and normal transfers.
- Introduce separate `ToolEvidenceArtifact`, `CandidateArtifact`, and `AgentDecisionArtifact` contracts.
- Allow only the agent artifact to contain a final recommendation.
- Require agent authorship metadata on every final recommendation.

Release gate:

- Exhaustively test every phase and action combination, including rejection of a GW1 `roll`.
- Prove that tool and candidate artifacts cannot be parsed as agent decisions.

Status: delivered.

### 0.0.8: Facts, Assumptions, and Provenance

Expose the basis of every agent decision and prevent self-referential corroboration.

- Add stable IDs for sources, observations, facts, assumptions, transformations, and decisions.
- Track publisher, source type, observation time, retrieval time, reliability, freshness, and upstream lineage.
- Treat internal reports as transformations rather than independent sources.
- Count source independence by originating publisher and claim, not by generated file.
- Require every fact to resolve to an observation and every assumption to identify its evidence and model version.
- Require every agent decision to reference the facts and assumptions on which it depends.

Release gate:

- Reject orphaned and circular dependencies.
- Verify that multiple internal reports derived from one observation count as one source.
- Preserve legacy v1 artifact reads through a compatibility adapter.

Status: delivered.

### 0.0.9: Current-Role Evidence

Stop treating historical minutes as current-role certainty.

- Add configurable public adapters for official availability, official club or manager evidence, preseason lineups, public predicted-lineup sources, and reviewed manual evidence.
- Normalize historical availability, historical starts, current manager preference, preseason start rate, predicted-lineup consensus, injury status, squad competition, substitution patterns, and set-piece roles independently.
- Apply the evidence hierarchy from current confirmation through historical minutes.
- Prevent raw historical minutes from producing high current-role confidence by themselves.
- Keep adapter failures and missing coverage visible rather than falling back silently.

Release gate:

- Test evidence precedence, recency decay, manual overrides, source disagreement, and missing-source behavior.
- Verify that historical-only evidence cannot produce a current-role `READY` result.

Status: delivered.

## Planned Releases

### 0.0.10: Probabilistic Projection Tools

Propagate uncertainty into evidence without making selections.

- Produce start probability, appearance probability, substitute probability, expected minutes, conditional start points, conditional substitute points, role-adjusted expected points, median, p10, p90, and evidence confidence.
- Use cached player history for empirical distributions when sufficient history exists.
- Use explicitly labelled position-price cohorts for players without sufficient history.
- Use deterministic seeds so identical inputs produce identical distributions.
- Keep evidence confidence distinct from football outcome variance.
- Replace clean squad totals with role-adjusted totals and probability ranges.

Release gate:

- Test probability invariants, deterministic output, distribution fallbacks, missing evidence, and conditional expectation arithmetic.
- Verify that a lower-projection secure player can outrank an uncertain player within a requested tool objective without becoming the final recommendation.

### 0.0.11: Evidence Readiness and Operational Triggers

Make evidence gaps operational while leaving every decision to the agent.

- Calculate `READY`, `CAUTION`, or `INSUFFICIENT` readiness for each player and decision area.
- Let the agent assign `LOCK`, `LIKELY`, `PROVISIONAL`, or `AVOID` decision statuses.
- Reject agent classifications that are unsupported by evidence readiness.
- Block final verification when required rules, prices, or fixtures are stale, a starter is unsupported, or more than two intended starters have insufficient role evidence.
- Emit a provisional workspace instead of a final recommendation when a final gate fails.
- Replace prose-only change conditions with trigger evidence containing a metric, operator, threshold, affected decisions, candidate response set, re-analysis scope, and next check time.
- Evaluate triggers on every refresh and at T-48h, T-24h, and T-2h when scheduled.
- Require the agent to choose every trigger response.

Release gate:

- Test all readiness boundaries, gate failures, time-based checks, and trigger transitions.
- Verify that no tool-generated trigger contains a chosen squad action.

### 0.0.12: Substitution-Aware Utility Tools

Give the agent mathematically correct bench evidence.

- Calculate role-adjusted starting-XI expected points plus expected legal automatic-substitution value.
- Use deterministic dynamic programming over appearance states, positions, formations, and bench order.
- Report first-, second-, and third-substitute marginal value separately.
- Report bench cost, formation coverage, expected substitution value, and downside range.
- Assume independent appearances initially and disclose that assumption in the artifact.
- Avoid tool-authored labels such as strong bench, weak bench, or optimal bench.

Release gate:

- Match hand-calculated substitution cases, including several simultaneous nonappearances and formation restoration.
- Verify that deeper bench slots receive value only through valid conditional substitution paths.

### 0.0.13: Complete Counterfactual Generator

Give the agent optimized legal alternatives rather than abstract player comparisons.

- Add an exact deterministic branch-and-bound generator with budget, position, club, formation, availability, inclusion, exclusion, and structural constraints.
- Generate complete legal candidates for requested premium combinations, no-premium structures, premium versus cheap defence, bench-depth structures, and agent-supplied constraints.
- Optimize every scenario independently for GW1, GW1-GW3, and GW1-GW6 evidence horizons.
- Compare role-adjusted points, ranges, expected minutes, captaincy options, substitution value, uncertain starters, ownership, price coverage, and fixture exposure.
- Keep comparisons neutral and prohibit winner, recommendation, and selected-variant fields.
- Require agent-authored decisions to compare optimized alternatives rather than unoptimized descriptions.

Release gate:

- Match brute-force results on small player pools.
- Validate legality, determinism, and bounded performance on the full player pool.
- Verify that comparison artifacts cannot express a final choice.

### 0.0.14: Transfer Graph and Replacement Liquidity

Replace vague flexibility language with reachability evidence.

- Build one-transfer and two-transfer reachability using selling price, bank, positions, club limits, and full squad legality.
- Exclude targets that fail configurable availability gates.
- Report credible reachable targets, same-price replacements, required moves, required bank, structural replacement cost, and replacement liquidity.
- Add transfer-path evidence to every counterfactual comparison.
- Leave the value placed on flexibility to the agent.

Release gate:

- Test reachability across bank, selling price, position changes, club limits, and paired structural moves.
- Verify that an unreachable target cannot contribute to replacement liquidity.

### 0.0.15: Captaincy Sensitivity and Agent Decision Workspace

Show whether captaincy differences are meaningful without selecting the captain.

- Calculate expected doubled value, probability of being the highest scorer, pairwise win probability, regret, and sensitivity to minutes, penalty, and fixture assumptions.
- Report statistical edge strength as evidence but never populate captain or vice-captain decisions.
- Mark an evidence edge `clear` only when the leader has at least a 60 percent probability of being best and remains first under configured sensitivity scenarios.
- Otherwise report the edge as `marginal` or `unresolved`.
- Build an agent decision workspace containing complete candidate comparisons, evidence readiness, unresolved assumptions, sensitivity results, and dependency prompts.
- Require the agent to author squad, transfers, XI, bench, captaincy, chip, statuses, trigger responses, and rationale.

Release gate:

- Test ties, marginal edges, sensitivity reversals, and missing-distribution behavior.
- Reject final decisions with missing fact or assumption dependencies.
- Verify that workspace generation never writes final player choices.

### 0.0.16: Calibration and Decision Postmortems

Measure whether evidence and agent decisions improve without learning incorrectly from outcomes.

- Freeze pre-deadline evidence, assumptions, distributions, candidates, and the agent-authored decision.
- Measure projected-points error, expected-minutes error, start and appearance Brier scores, interval coverage, captaincy regret, transfer regret, substitution value, bench-spend efficiency, and decision regret.
- Calculate decision regret only against legal alternatives available from the frozen pre-deadline evidence.
- Separate model error, evidence error, decision error, and normal outcome variance.
- Publish rolling calibration by source and model version.
- Require at least 100 player-gameweek observations before proposing parameter changes.
- Keep parameter adoption agent-authored, reviewed, and versioned; never self-apply changes.
- Generalize the website from hard-coded GW1 paths to current and historical gameweeks.

Release gate:

- Prove that post-deadline information cannot enter frozen decision-regret calculations.
- Test calibration sample thresholds, versioning, archive rendering, and missing-outcome handling.

## Planned Interfaces and Enforcement

Artifact schema v2 will add versioned contracts for:

- `DecisionContext`
- `ClaimLedger`
- `RoleEvidence`
- `ProbabilisticProjection`
- `EvidenceReadinessReport`
- `TriggerPlan`
- `SquadCandidate`
- `CounterfactualComparison`
- `TransferGraph`
- `CaptaincySensitivity`
- `AgentDecisionArtifact`
- `CalibrationReport`

`AgentDecisionArtifact` must record:

- agent authorship;
- competition phase;
- selected action and considered alternatives;
- fact and assumption dependencies;
- unresolved uncertainty;
- evidence-readiness results;
- agent rationale;
- agent-authored operational trigger responses.

Enforcement rules:

- Tool outputs use evidence or candidate types that cannot be parsed as final recommendations.
- Scripts may calculate legality, projections, probabilities, sensitivity, substitution utility, transfer reachability, and optimized counterfactuals.
- Scripts must never populate final squad IDs, transfers, formation, XI, bench order, captain, vice-captain, or chip in an agent decision artifact.
- Verification rejects unsupported or illegal decisions without replacing them.
- Comparison reports may expose Pareto dominance and metric differences but must not contain `winner`, `recommendedVariant`, `selectedVariant`, or equivalent fields.
- Agent prompts require legal full-squad counterfactuals for major structural choices.
- Artifact v1 remains readable through `0.0.16`; v2 becomes authoritative incrementally.

## Mathematical Defaults

Initial role-evidence reliability weights:

| Evidence | Weight |
| --- | ---: |
| Explicit manager confirmation | 0.95 |
| Official club role evidence | 0.90 |
| Predicted-lineup vote | 0.75 |
| Preseason starting rate | 0.65 |
| Previous-season starting rate | 0.45 |
| Raw historical-minutes evidence | 0.30 |

- Current evidence decays with a 14-day half-life.
- Historical evidence decays with a 60-day half-life.
- Missing current-role evidence caps confidence at `0.45`.

Initial readiness thresholds:

| Readiness | Requirements |
| --- | --- |
| `READY` | Start probability at least 0.80, appearance probability at least 0.90, confidence at least 0.70, and current-role evidence present. |
| `CAUTION` | Start probability at least 0.70, appearance probability at least 0.85, and confidence at least 0.55. |
| `INSUFFICIENT` | The `READY` and `CAUTION` requirements are not met. |

Squad evidence is a metric vector rather than a hidden overall score:

- role-adjusted starting-XI expected points;
- automatic-substitution expected points;
- p10, median, and p90 squad points;
- unresolved-role count;
- bench-slot marginal values;
- replacement liquidity;
- structural replacement cost.

Candidate generation exposes separate tool objectives:

- maximum expected points;
- maximum downside protection among squads within 1.0 expected point of the maximum;
- minimum bench cost subject to first-substitute appearance probability of at least 0.85;
- maximum replacement liquidity among squads within 1.0 expected point of the maximum.

The agent decides which evidence and tradeoffs determine the final recommendation.

## Cross-Release Acceptance Requirements

- Preserve the authenticated-action safety boundary.
- Preserve transactional and offline evidence refresh behavior.
- Keep public adapters configurable and usable without paid credentials.
- Treat missing evidence as a first-class result rather than historical certainty.
- Validate new artifacts at transactional refresh boundaries.
- Add unit, integration, schema, compatibility, and deterministic snapshot coverage for every release.
- Preserve existing benchmarked paths within 20 percent of their committed baselines or document and approve a new baseline.
- Add dedicated full-pool performance baselines for counterfactual generation and transfer graphs.
- Update this roadmap's current-state section only after a release passes all of its acceptance gates.

## Deferred Limitations

- Public manager responses remain unnormalized unless a planned release requires them for frozen decision-state capture.
- Individual evidence commands remain non-transactional outside the shared refresh workflow.
- Direct player-market odds remain dependent on public availability.
- Source coverage may remain incomplete; evidence gates must expose that limitation.

## Safety Boundary

The repository does not log into FPL, store authenticated FPL cookies, automate authenticated management pages, or submit team changes. The coding agent authors recommendations, and the human applies accepted decisions manually.
