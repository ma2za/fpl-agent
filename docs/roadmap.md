# Roadmap

This document records the capabilities present through `0.0.11` and the dependency-ordered plan from `0.0.12` through `0.0.18`.

## Permanent Decision Boundary

- The repository supplies tools, evidence, calculations, validation, workspace, and guidance.
- Deterministic code may generate legal candidates and counterfactuals, but it must never select or rank the final choice.
- The coding agent makes every FPL decision: squad, transfers, formation, starting XI, bench order, captaincy, chips, decision status, and trigger response.
- The human decides whether to apply the agent's recommendation manually in the official FPL interface.
- Nothing in the repository may authenticate with FPL, retain authenticated cookies, automate management pages, or submit changes.
- Tool-produced evidence and candidate artifacts must remain structurally separate from agent-authored decision artifacts.
- Verification may reject illegal or unsupported decisions, but it must never replace them or choose an alternative.

## Current State: 0.0.11

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

- The locked local test suite passes 37 test files and 279 tests at the `0.0.11` status update.
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

- Root sources and observations for official availability, manager and club evidence, preseason and predicted lineups, substitution events, transfer reporting, and bookmaker markets.
- Canonical URLs, publication and retrieval times, captured values, adapter versions, content hashes, and underlying claim IDs.
- Independent normalization and confidence for historical role, manager preference, preseason usage, predicted lineups, availability, squad competition, transfer risk, and set-piece roles.
- Explicit reliability hierarchy and recency decay for current and historical evidence.
- Coding-agent evidence override precedence and dimension-local source disagreement.
- Publisher-and-claim deduplication for syndicated or repeatedly transformed evidence.
- Configured, fetched, parsed, matched, stale, failed, and unsupported adapter metrics.
- Current, historical-only, conflicting, and missing coverage retained for every selected-player dimension.
- Historical-only confidence capped at `0.45` and prohibited from producing `READY`.

Current limitation:

- Most players still lack independent current-role evidence beyond official availability and historical FPL data.
- Generated current-role reports expose that gap, but recommendation projections do not yet propagate it numerically.
- Root provenance for club statements, press conferences, preseason lineups, predicted lineups, injuries, transfers, and odds is not yet complete enough to support strong role-security claims.
- Historical minutes remain a fallback input and must not be described as current-role confirmation.

### Epistemic Integrity and Phase-Aware Language

- Claim-ledger v3 distinguishes observations, deterministic derived facts, assumptions, forecasts, and decisions.
- Forecasts name their model, version, fact and assumption inputs, output, uncertainty, and horizon.
- Decisions can depend directly on forecasts while preserving full provenance validation.
- Structured language findings reject evaluative facts, unsupported causality, ownership-as-safety, and historical-minutes guarantees.
- Phase-aware statement policy excludes price-movement and transfer-hit warnings from preseason draft decisions.
- Claim-ledger v1 and v2 remain readable without fabricated epistemic classifications.

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

- Add configurable public adapters for official availability, official club or manager evidence, preseason lineups, public predicted-lineup sources, and coding-agent-reviewed evidence.
- Normalize historical availability, historical starts, current manager preference, preseason start rate, predicted-lineup consensus, injury status, squad competition, substitution patterns, and set-piece roles independently.
- Apply the evidence hierarchy from current confirmation through historical minutes.
- Prevent raw historical minutes from producing high current-role confidence by themselves.
- Keep adapter failures and missing coverage visible rather than falling back silently.

Release gate:

- Test evidence precedence, recency decay, manual overrides, source disagreement, and missing-source behavior.
- Verify that historical-only evidence cannot produce a current-role `READY` result.

Status: delivered.

### 0.0.10: Epistemic Integrity and Phase-Aware Language

Prevent interpretations, forecasts, and generic prose from being presented as facts.

Scope:

- Replace the ambiguous fact layer with strict claim kinds: `OBSERVATION`, `DERIVED_FACT`, `ASSUMPTION`, `FORECAST`, and `DECISION`.
- Define `OBSERVATION` as a source-attributed statement or measurement and `DERIVED_FACT` as a deterministic transformation whose result does not depend on a football-strength or decision-utility assumption.
- Require every `FORECAST` to name its model, model version, input facts, input assumptions, output value, uncertainty, and horizon.
- Prohibit evaluative language such as `favorable`, `secure`, `safe`, `strong`, `weak`, `value`, or `acceptable` in observations and derived facts unless the source itself is being quoted and attributed.
- Migrate claims such as “fixtures favor triple Manchester United” from facts to forecasts or decisions. Preserve “Manchester United play Hull and Ipswich in GW1-2” as an observation.
- Add a phase-aware statement policy keyed by `DecisionContext.phase`.
- Suppress preseason price-rise and transfer-hit warnings in `PRESEASON_DRAFT`; replace them with valid flexibility statements such as unavailable upgrade paths or price-tier constraints.
- Add rationale lint rules for unsupported causality, ownership-as-safety, historical-minutes guarantees, and model interpretations phrased as external facts.
- Emit structured validation findings with claim ID, phrase, rule, severity, and suggested claim kind. Do not rewrite agent-authored rationale automatically.
- Extend the provenance graph so decisions can depend on forecasts as well as facts and assumptions.

Artifacts:

- `EpistemicClaim`
- `ForecastClaim`
- `LanguageValidationReport`
- `PhaseStatementPolicy`
- claim-ledger v3 migration adapter

Release gate:

- Reject a derived fact containing “fixtures favor triple United.”
- Accept the fixture observation, weaker-opponent assumption, attack forecast, and exposure decision when represented separately.
- Reject “Bruno costs more because he anchors captaincy” as unsupported causal language.
- Reject “historical minutes guarantee starts” and flag “ownership makes this pick safe.”
- Suppress preseason price-change warnings while retaining post-deadline price-movement risks.
- Preserve read compatibility for v1 and v2 claim ledgers without inventing missing epistemic types.

Status: delivered.

### 0.0.11: Source-Grounded Current-Role Evidence

Make every current-role conclusion traceable to independent root evidence rather than to authoritative-sounding local reports.

Scope:

- Create source records for club press conferences, official injury updates, manager comments, preseason match lineups, substitution events, reliable predicted lineups, credible transfer reporting, and bookmaker markets.
- Store the original publisher, canonical URL, publication time, retrieval time, captured excerpt or structured value, adapter version, and content hash for every observation.
- Record a report as a transformation over root observations, never as an independent source.
- Retain source disagreement by dimension instead of collapsing it into one role label.
- Deduplicate syndicated stories and copied predicted lineups by publisher and underlying claim.
- Add per-dimension confidence for `historicalRole`, `currentManagerPreference`, `preseasonUsage`, `predictedLineupConsensus`, `availability`, `squadCompetition`, `transferRisk`, and `setPieceRole`.
- Separate evidence confidence from the estimated probability of starting.
- Keep historical minutes as a fallback with a hard confidence cap and an explicit `historical_only` reason code.
- Require selected-player evidence reports to show which dimensions have current sources, historical-only sources, conflicting sources, or no coverage.
- Add adapter health metrics: configured, fetched, parsed, matched, stale, failed, and unsupported.

Artifacts:

- `RootEvidenceSource`
- `RoleObservation`
- `RoleDimensionAssessment`
- `RoleEvidenceReport`
- `AdapterCoverageReport`

Release gate:

- Trace every non-historical role claim to at least one root observation and publisher.
- Prove that three local reports derived from one club statement count as one independent source.
- Cap historical-only current-role confidence at `0.45`.
- Preserve conflicting manager, lineup, and transfer evidence without silently averaging it away.
- Mark missing predicted-lineup or odds coverage as missing rather than replacing it with historical confidence.

Status: delivered.

## Planned Releases

### 0.0.12: Start Probability and Role-Adjusted Projections

Make uncertain role evidence change the numbers used downstream.

Scope:

- Estimate mutually exclusive `startProbability`, `subAppearanceProbability`, and `noAppearanceProbability` values that sum to one.
- Derive `appearanceProbability`, expected minutes, and a minutes distribution from those states.
- Keep separate `historicalRoleConfidence`, `currentRoleEvidenceConfidence`, `availabilityConfidence`, and `overallEvidenceConfidence` fields.
- Produce `rawProjectionIfStarting`, `conditionalSubstitutePoints`, `roleAdjustedProjection`, median, p10, p90, and projection standard deviation.
- Define role-adjusted points as the probability-weighted expectation across start, substitute, and no-appearance states.
- Use cached player history for empirical conditional distributions when sample coverage is sufficient.
- Use explicitly labeled position, price, team-strength, and role cohorts when history is insufficient.
- Apply deterministic seeds and persist model inputs so identical evidence produces identical distributions.
- Keep evidence uncertainty distinct from football outcome variance and report both.
- Prevent a high raw projection from bypassing a low start probability in tool objectives.

Artifacts:

- `AppearanceStateForecast`
- `MinutesDistribution`
- `ProbabilisticProjection`
- `ProjectionUncertaintyReport`

Release gate:

- Test probability invariants, deterministic output, missing-evidence behavior, cohort fallbacks, and conditional expectation arithmetic.
- Verify that reducing start probability lowers role-adjusted expected points without changing conditional-start points.
- Verify that a lower raw-projection secure player can outrank an uncertain player under a role-adjusted objective.
- Snapshot examples for an established starter, a transfer-threatened starter, a preseason challenger, and a new promoted player.

### 0.0.13: Role-Adjusted Squad Utility and Robustness

Quantify what raw expected points are exchanged for when the agent chooses a more reliable structure.

Scope:

- Calculate raw starting-XI projection, role-adjusted starting-XI projection, expected starters, expected appearances, and unresolved-role count.
- Calculate p10, median, p90, standard deviation, and probability of falling below configurable squad-point thresholds.
- Add legal automatic-substitution value using deterministic dynamic programming over appearance states, positions, formations, and bench order.
- Report first-, second-, and third-substitute marginal values separately.
- Report bench cost, formation coverage, expected autosub value, and downside protection without labeling a bench good or bad.
- Compare every authored draft against its immediately preceding draft when available.
- Show raw projection delta, role-adjusted delta, expected-starter delta, autosub delta, downside delta, and bench-cost delta.
- Store metric vectors rather than collapsing robustness into an undisclosed overall score.
- Disclose the initial independent-appearance assumption until correlated appearance scenarios are delivered in `0.0.15`.

Artifacts:

- `SquadUtilityVector`
- `SubstitutionUtilityReport`
- `DraftDeltaReport`
- `RobustnessReport`

Release gate:

- Match hand-calculated substitution cases, including simultaneous nonappearances and formation restoration.
- Verify that deeper bench slots receive value only through valid conditional substitution paths.
- Reproduce an explicit old-versus-new comparison showing whether a raw projection sacrifice buys role-adjusted value or downside protection.
- Reject prose claims such as “more robust” when no cited robustness metric supports them.

### 0.0.14: Complete Counterfactual Optimization

Generate the strongest legal version of every material structure before the agent compares them.

Scope:

- Add an exact deterministic branch-and-bound generator with budget, position, club, formation, availability, inclusion, exclusion, and structural constraints.
- Optimize using role-adjusted squad utility, with the raw projection retained as a reported metric rather than the default objective.
- Generate independent constrained candidates for major premium inclusions, premium combinations, no-premium structures, premium versus cheap defence, bench-depth policies, and club-exposure limits.
- Support explicit scenarios such as `Saka included`, `Gabriel included`, `triple Man Utd`, and `maximum two Man Utd`.
- Re-optimize all unrelated slots inside each scenario. Never derive a rejected structure by swapping one player into the selected squad.
- Run requested objectives independently for GW1, GW1-GW3, and GW1-GW6 horizons.
- Preserve multiple Pareto candidates when expected points, downside, bench value, and role confidence conflict.
- Compare complete metric vectors, constraint differences, and player deltas neutrally.
- Prohibit `winner`, `recommendedVariant`, `selectedVariant`, and equivalent final-choice fields.
- Require an agent-authored recommendation to cite optimized counterfactual IDs for every material structural rejection.

Artifacts:

- `OptimizationRequest`
- `SquadCandidate`
- `CounterfactualSet`
- `CounterfactualComparison`
- `OptimizationProof`

Release gate:

- Match exhaustive brute-force results on small player pools.
- Prove that each constrained scenario is independently optimized.
- Validate legality, determinism, objective bounds, and bounded full-pool performance.
- Fail recommendation quality when a major rejected premium or club-exposure structure is represented only by prose or an unoptimized squad.
- Verify that candidate and comparison artifacts cannot parse as final decisions.

### 0.0.15: Concentration and Correlated Scenario Analysis

Measure portfolio risk when several selections depend on the same team-strength or tactical assumption.

Scope:

- Represent shared assumptions for team attack, team defense, tactical role, clean-sheet environment, penalties, and manager selection.
- Generate configurable strong, baseline, and weak scenarios for each concentrated club exposure.
- Recalculate candidate utility under each scenario rather than summing independent player projections.
- Report pairwise and squad-level covariance, club concentration, assumption concentration, scenario regret, and downside contribution.
- Compare double-up and triple-up structures using the independently optimized candidates from `0.0.14`.
- Add a configurable concentration-penalty objective for candidate generation, but expose the penalty separately from expected points.
- Never assert that a triple-up is acceptable solely because individual fixtures are rated favorably.
- Require the agent to state which scenario tradeoff justified accepting or rejecting concentrated exposure.

Artifacts:

- `SharedAssumptionGraph`
- `ClubScenarioSet`
- `ConcentrationRiskReport`
- `ScenarioComparison`

Release gate:

- Test a three-player club exposure under strong, baseline, and weak team scenarios.
- Verify that shared team-strength shocks affect every dependent player and are not counted as independent events.
- Compare optimal maximum-two and triple-club candidates with expected utility, p10, and scenario regret.
- Reject an unsupported “fixtures justify triple exposure” rationale when no concentration evidence is cited.

### 0.0.16: Evidence Readiness and Executable Triggers

Turn uncertainty and change conditions into machine-evaluable monitoring plans while leaving responses to the agent.

Scope:

- Calculate `READY`, `CAUTION`, or `INSUFFICIENT` readiness for each player and decision area from current-role evidence, appearance probabilities, data freshness, and source coverage.
- Let the agent assign `LOCK`, `LIKELY`, `PROVISIONAL`, or `AVOID` decision statuses.
- Reject agent classifications that are stronger than their evidence readiness permits.
- Block final verification when required rules, prices, or fixtures are stale, a starter is unsupported, or more than two intended starters have insufficient role evidence.
- Emit a provisional workspace instead of a final recommendation when a final gate fails.
- Replace each prose-only change condition with a trigger containing `triggerId`, metric, subject, operator, threshold, evidence dependency, affected decision IDs, candidate response set, re-analysis scope, next check time, and expiry.
- Support triggers for start probability, availability, price tier, source disagreement, transfer status, lineup consensus, odds movement, and competition phase.
- Evaluate triggers after every successful refresh and at scheduled T-48h, T-24h, and T-2h checkpoints.
- Record `inactive`, `armed`, `fired`, `acknowledged`, `expired`, and `superseded` states.
- Require the coding agent to select every response; a fired trigger may request re-analysis but cannot transfer, lock, or replace a player.

Artifacts:

- `EvidenceReadinessReport`
- `DecisionStatusReport`
- `TriggerPlan`
- `TriggerEvaluation`
- `ProvisionalDecisionWorkspace`

Release gate:

- Test readiness boundaries, stale-data failures, scheduled evaluations, idempotent refreshes, and every trigger-state transition.
- Exercise concrete Kinsky first-choice, Osula start-probability, secure £4.0m defender, and Slater role-loss triggers.
- Verify that a fired trigger identifies affected decisions and counterfactual requests without choosing a squad action.
- Prove that phase changes expire or rewrite invalid trigger conditions.

### 0.0.17: Replacement Liquidity, Captaincy Sensitivity, and Decision Workspace

Replace vague flexibility and captaincy language with reachable alternatives and sensitivity evidence.

Scope:

- Build one-transfer and two-transfer reachability using selling price, bank, positions, club limits, availability gates, and complete squad legality.
- Distinguish preseason budget reachability from post-deadline selling-price reachability.
- Report credible same-tier targets, required bank, required paired moves, structural replacement cost, and replacement liquidity.
- Add transfer-path evidence to every counterfactual without treating higher liquidity as automatically better.
- Calculate captaincy expected doubled value, probability of being highest scorer, pairwise win probability, regret, and sensitivity to minutes, penalties, fixtures, and role assumptions.
- Mark a captaincy evidence edge `clear` only when the leader has at least a 60 percent probability of being best and remains first across configured sensitivity scenarios.
- Otherwise report the edge as `marginal` or `unresolved`.
- Build an agent decision workspace containing optimized counterfactuals, utility vectors, concentration scenarios, readiness, triggers, liquidity, captaincy sensitivity, unresolved assumptions, and dependency prompts.
- Require the agent to author squad, transfers, XI, bench, captaincy, chip, statuses, trigger responses, and rationale.

Artifacts:

- `TransferGraph`
- `ReplacementLiquidityReport`
- `CaptaincySensitivity`
- `AgentDecisionWorkspace`

Release gate:

- Test reachability across bank, selling price, position changes, club limits, paired moves, and preseason phase semantics.
- Verify that an unreachable target cannot contribute to replacement liquidity.
- Test captaincy ties, marginal edges, sensitivity reversals, and missing-distribution behavior.
- Verify that workspace generation never writes final player choices.

### 0.0.18: Calibration and Decision Postmortems

Measure whether evidence, forecasts, candidate generation, and agent decisions improve without learning incorrectly from outcomes.

Scope:

- Freeze pre-deadline observations, assumptions, forecasts, distributions, candidates, scenarios, triggers, and the agent-authored decision.
- Measure projected-points error, expected-minutes error, start and appearance Brier scores, interval coverage, calibration by probability band, captaincy regret, transfer regret, substitution value, bench-spend efficiency, concentration regret, and decision regret.
- Calculate decision regret only against legal optimized alternatives available from frozen pre-deadline evidence.
- Separate source error, transformation error, forecast error, evidence-gap error, decision error, and normal outcome variance.
- Compare forecast calibration by evidence dimension, source publisher, adapter version, and model version.
- Audit fired and missed triggers against frozen evidence arrival times.
- Require at least 100 player-gameweek observations before proposing parameter changes.
- Keep parameter adoption agent-authored, reviewed, versioned, and reversible; never self-apply changes.
- Generalize the website from hard-coded GW1 paths to current and historical gameweeks, including uncertainty, counterfactual, trigger, and calibration views.

Release gate:

- Prove that post-deadline information cannot enter frozen forecast or decision-regret calculations.
- Test calibration sample thresholds, versioning, trigger audits, archive rendering, and missing-outcome handling.
- Reconstruct whether a failure originated in source evidence, transformation, assumption, forecast, optimization request, or agent decision.

## Delivery Dependencies and Migration

| Release | Depends on | Migration rule | Exit artifact used by next release |
| --- | --- | --- | --- |
| `0.0.10` | claim ledger v2 and competition state | Read v1/v2; write claim-ledger v3; report untyped legacy claims without guessing their type | Typed observations, assumptions, forecasts, decisions, and phase-valid language |
| `0.0.11` | typed claims | Convert existing adapters to root observations incrementally; uncovered adapters remain explicit gaps | Dimension-level role evidence and confidence |
| `0.0.12` | role dimensions and source confidence | Keep legacy deterministic projections for comparison only; new consumers use probabilistic projections | Appearance-state and role-adjusted player distributions |
| `0.0.13` | probabilistic projections | Generate both legacy raw totals and new utility vectors for one release | Squad utility and substitution metrics |
| `0.0.14` | squad utility | Preserve authored variants; mark unoptimized variants ineligible for structural-comparison evidence | Independently optimized legal candidate sets |
| `0.0.15` | counterfactual sets | Treat independent-player totals as baseline-only and disclose missing covariance | Concentration scenarios and shared-assumption risk |
| `0.0.16` | probabilities, scenarios, and candidate requests | Convert prose conditions to draft triggers for agent review; never infer thresholds silently | Evaluated readiness and trigger states |
| `0.0.17` | optimized candidates and trigger scopes | Keep existing transfer evidence readable; add phase-specific reachability | Liquidity, captaincy sensitivity, and complete decision workspace |
| `0.0.18` | frozen outputs from all prior releases | Archive schema and model versions with every decision state | Calibration and attributable postmortems |

Implementation order is strict where the downstream calculation would otherwise manufacture precision. In particular:

- Counterfactual optimization does not ship before role-adjusted projections.
- Concentration penalties do not ship before independently optimized double-up and triple-up candidates exist.
- Readiness triggers do not ship before their metrics have stable, versioned definitions.
- Calibration does not alter model parameters automatically.

Review-derived regression fixtures remain pinned through the migration:

- A fixture list can be an observation; “the fixtures justify triple exposure” cannot be a fact.
- An established historical player with weak current evidence retains high historical confidence but lower current-role confidence and start probability.
- A draft with lower raw points can only be described as more robust when its role-adjusted, expected-starter, autosub, or downside metrics improve.
- The best legal Saka-included squad and best legal Gabriel-included squad are generated independently.
- Maximum-two and triple-Man-Utd candidates are evaluated under the same strong, baseline, and weak United scenarios.
- A `PRESEASON_DRAFT` recommendation cannot warn about pre-deadline price changes.
- Kinsky role confirmation, Osula start probability, a secure £4.0m defender, and Slater role loss are represented as typed trigger evaluations rather than prose alone.

## Planned Interfaces and Enforcement

Planned releases add versioned contracts for:

- `DecisionContext`
- `EpistemicClaim`
- `ForecastClaim`
- `ClaimLedgerV3`
- `RootEvidenceSource`
- `RoleDimensionAssessment`
- `AppearanceStateForecast`
- `ProbabilisticProjection`
- `SquadUtilityVector`
- `SubstitutionUtilityReport`
- `OptimizationRequest`
- `EvidenceReadinessReport`
- `TriggerPlan`
- `SquadCandidate`
- `CounterfactualComparison`
- `ConcentrationRiskReport`
- `TransferGraph`
- `CaptaincySensitivity`
- `AgentDecisionWorkspace`
- `AgentDecisionArtifact`
- `CalibrationReport`

`AgentDecisionArtifact` must record:

- agent authorship;
- competition phase;
- selected action and considered alternatives;
- observation, derived-fact, assumption, and forecast dependencies;
- unresolved uncertainty;
- evidence-readiness results;
- optimized counterfactual IDs for material structural comparisons;
- concentration and robustness evidence for concentrated exposures;
- agent rationale;
- agent-authored operational trigger responses.

Enforcement rules:

- Tool outputs use evidence or candidate types that cannot be parsed as final recommendations.
- Scripts may calculate legality, projections, probabilities, robustness, concentration scenarios, sensitivity, substitution utility, transfer reachability, and optimized counterfactuals.
- Scripts must never populate final squad IDs, transfers, formation, XI, bench order, captain, vice-captain, or chip in an agent decision artifact.
- Verification rejects unsupported or illegal decisions without replacing them.
- Comparison reports may expose Pareto dominance and metric differences but must not contain `winner`, `recommendedVariant`, `selectedVariant`, or equivalent fields.
- Agent prompts require legal full-squad counterfactuals for major structural choices.
- Phase-aware validation rejects risks and rationales that are impossible in the current competition state.
- A local report cannot count as a root source when evaluating source independence.
- Artifact v1 and v2 remain readable through `0.0.18`; new claim-ledger writes use v3 after `0.0.10`.

## Epistemic Contract

| Claim kind | Meaning | Allowed dependencies | Example |
| --- | --- | --- | --- |
| `OBSERVATION` | Source-attributed statement or measurement | One root source | Man Utd play Hull and Ipswich in GW1-2. |
| `DERIVED_FACT` | Deterministic result that does not require a football or utility assumption | Observations and deterministic transformations | The squad costs £100.0m and uses three Man Utd slots. |
| `ASSUMPTION` | Contestable premise used by a model or decision | Observations or derived facts | Promoted teams begin materially below league-average strength. |
| `FORECAST` | Model output about an uncertain future state | Observations, facts, assumptions, and a versioned model | Man Utd have a 1.7 expected-goal baseline at Hull. |
| `DECISION` | Agent-authored choice or judgment | Any upstream claim except another final decision | Use three Man Utd players in the provisional draft. |

Rules:

- A statement does not become a fact because an internal report generated it.
- Model transformations output forecasts when any football-strength, role, or utility assumption is involved.
- A source quotation retains its source attribution and does not become a repository-endorsed fact.
- Forecast confidence and source confidence remain separate.
- Decisions may be supported by uncertain forecasts, but the uncertainty must remain visible.
- Validators report invalid claim types and language; they do not silently recast or rewrite agent-authored claims.

## Phase-Aware Statement Policy

| Phase | Allowed financial risks | Suppressed or rejected language |
| --- | --- | --- |
| `PRESEASON_DRAFT` | Budget ceiling, price-tier reachability, upgrade-path shortfall | Price rises, price falls, selling-price loss, transfer hits |
| `LIVE_GAMEWEEK` | None until the next transfer window is active | Immediate transfer execution or price action during a locked deadline |
| `TRANSFER_WINDOW` | Price movement, selling price, bank, transfer cost, replacement reachability | Preseason-only draft language |
| `FINAL_LOCKDOWN` | Deadline and late-news execution risk | Unscheduled long-horizon monitoring presented as actionable before lock |
| `SEASON_COMPLETE` | None | Transfers, chips, price movement, or deadline actions |

Every generated risk and rationale template must declare its allowed phases. Verification rejects a template instance when the active phase is not allowed.

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

- raw starting-XI expected points conditional on the configured minutes baseline;
- role-adjusted starting-XI expected points;
- automatic-substitution expected points;
- expected starters and expected appearances;
- p10, median, and p90 squad points;
- projection standard deviation and probability below configured downside thresholds;
- unresolved-role count;
- bench-slot marginal values;
- club and shared-assumption concentration;
- scenario regret;
- replacement liquidity;
- structural replacement cost.

Role-adjusted player projection uses mutually exclusive appearance states:

```text
P(start) + P(substitute appearance) + P(no appearance) = 1

roleAdjustedPoints
  = P(start) * E[points | start]
  + P(substitute appearance) * E[points | substitute appearance]
```

The projection stores the conditional values and probabilities separately so reviewers can identify whether a difference comes from football output, role probability, or evidence confidence.

Candidate generation exposes separate tool objectives:

- maximum role-adjusted expected points;
- maximum p10 downside protection among squads within 1.0 role-adjusted expected point of the maximum;
- minimum bench cost subject to first-substitute appearance probability of at least 0.85;
- maximum replacement liquidity among squads within 1.0 expected point of the maximum.

Every material structural comparison runs at least these independent constraints when applicable:

- included premium A;
- included premium B;
- concentrated club exposure allowed;
- maximum two players from the concentrated club;
- minimum bench-role threshold;
- agent-supplied inclusion and exclusion constraints.

Each run returns the best legal candidate for its own constraints plus any non-dominated alternatives. A rejected candidate cannot be produced by degrading the selected candidate manually.

The agent decides which evidence and tradeoffs determine the final recommendation.

## Criticism Traceability

| Criticism | Primary release | Required proof |
| --- | --- | --- |
| Interpretations promoted to facts | `0.0.10` | Invalid fact classification is rejected and migrated to forecast or decision. |
| Shallow root provenance | `0.0.11` | Role claims resolve to independent publisher observations rather than local report names. |
| Historical minutes dominate role certainty | `0.0.11` | Historical and current-role confidence are separate; historical-only confidence remains capped. |
| Role uncertainty absent from projections | `0.0.12` | Start, substitute, and no-appearance probabilities change role-adjusted points. |
| Alternative squads are manually weakened | `0.0.14` | Every major structure is independently optimized under explicit constraints. |
| Robustness is qualitative | `0.0.13` | Draft deltas quantify raw points, adjusted points, starters, autosubs, and downside. |
| Triple-club exposure ignores correlation | `0.0.15` | Maximum-two and triple-up candidates are compared across shared strong, baseline, and weak scenarios. |
| Explanations contain false causality | `0.0.10` | Language validation reports unsupported causal and safety claims. |
| Preseason price-change warning is invalid | `0.0.10` | Phase policy suppresses price-movement risk before the opening deadline. |
| Change conditions are not executable | `0.0.16` | Typed triggers fire from measurable thresholds and request agent re-analysis without choosing an action. |

## Cross-Release Acceptance Requirements

- Preserve the authenticated-action safety boundary.
- Preserve transactional and offline evidence refresh behavior.
- Keep public adapters configurable and usable without paid credentials.
- Preserve root-source attribution and content hashes through every transformation.
- Treat missing evidence as a first-class result rather than historical certainty.
- Keep evidence confidence, appearance probability, and outcome variance as separate values.
- Validate new artifacts at transactional refresh boundaries.
- Require every generated sentence template to declare compatible competition phases.
- Add unit, integration, schema, compatibility, and deterministic snapshot coverage for every release.
- Preserve existing benchmarked paths within 20 percent of their committed baselines or document and approve a new baseline.
- Add dedicated full-pool performance baselines for probability simulation, substitution utility, counterfactual generation, scenario analysis, and transfer graphs.
- Update this roadmap's current-state section only after a release passes all of its acceptance gates.

## Deferred Limitations

- Public manager responses remain unnormalized unless a planned release requires them for frozen decision-state capture.
- Individual evidence commands remain non-transactional outside the shared refresh workflow.
- Direct player-market odds remain dependent on public availability.
- Source coverage may remain incomplete; evidence gates must expose that limitation.

## Safety Boundary

The repository does not log into FPL, store authenticated FPL cookies, automate authenticated management pages, or submit team changes. The coding agent authors recommendations, and the human applies accepted decisions manually.
