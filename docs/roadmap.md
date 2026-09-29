# Roadmap

This document records the capabilities present through `0.0.28` and the prioritized correctness program through `0.0.37`.

## Permanent Decision Boundary

- The repository supplies tools, evidence, calculations, validation, workspace, and guidance.
- Deterministic code may generate legal candidates and counterfactuals, but it must never select or rank the final choice.
- The coding agent makes every FPL decision: squad, transfers, formation, starting XI, bench order, captaincy, chips, decision status, and trigger response.
- The human decides whether to apply the agent's recommendation manually in the official FPL interface.
- Nothing in the repository may authenticate with FPL, retain authenticated cookies, automate management pages, or submit changes.
- Tool-produced evidence and candidate artifacts must remain structurally separate from agent-authored decision artifacts.
- Verification may reject illegal or unsupported decisions, but it must never replace them or choose an alternative.

## Current State: 0.0.28

### Workspace

- TypeScript pnpm monorepo.
- Read-only Next.js application.
- Public FPL API client with validation and local caching.
- Deterministic rules and evidence packages.
- Local content for context, strategy, recommendations, and postmortems.
- Ignored local SQLite player-intelligence store with ordered migrations, foreign keys, immutable observations, revisions, and lineage.

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
- Grouped rollback-capable promotion of the gameweek directory and SQLite store.
- Full active-player bootstrap snapshots, element-summary fixtures and performance, explicit history coverage, and an all-player research worklist.
- Schema-validated partial coding-agent web-evidence ingestion with provenance, zero-result and blocked coverage, and transactional rollback.
- Deterministic player dossiers, all-player dossier index, readiness reports, authored decision-status validation, executable trigger evaluation, and provisional workspaces.
- Selected-player research coverage is blocking; other dossier-readiness gaps remain visible.
- Role-adjusted squad utility vectors, deterministic downside distributions, and configurable point thresholds.
- Exact independent-appearance automatic-substitution value with separate goalkeeper and first-, second-, and third-substitute contributions.
- Bench cost, formation coverage, unresolved-role counts, and explicit previous-draft metric deltas.
- Exact deterministic branch-and-bound optimization for independently constrained counterfactual squads.
- GW1, GW1-GW3, and GW1-GW6 objectives with raw, role-adjusted, downside, bench-value, and role-confidence vectors.
- Neutral counterfactual comparisons, optimization proofs, and material structural-rejection citation gates.
- Shared-assumption strong, baseline, and weak scenarios for concentrated club exposures.
- Pairwise covariance, squad variance, correlated p10, concentration penalties, scenario regret, and downside contribution.
- Neutral maximum-two and triple-club comparisons over independently optimized candidates.
- Immutable evidence snapshots, canonical decision evaluations, numerical invariants, and factual-claim publication gates.
- Final recommendations require completed current research coverage for every selected player and five distinct relevant public-news articles across the selected squad.
- Resumable news review queues prioritize the submitted squad and retain explicit accepted, rejected, duplicate, irrelevant, and deferred outcomes.
- Accepted news evidence must resolve to a discovered player-matched root URL; unreviewed candidates cannot become observations.
- Review batches incrementally rebuild affected dossiers and shared readiness without replacing the official-data worklist.
- Deadline archives recursively retain and hash every gameweek artifact while storing frozen row-level forecasts in SQLite.
- Final official outcomes append as idempotent player revisions; late corrections retain effective time and supersession lineage.
- Calibration is reproduced from frozen forecasts and latest finalized outcomes, segmented by position, evidence, adapter, model, and probability band.
- Decision regret uses only frozen legal candidates and reconciles agent choices separately from manager overrides.
- Model changes require versioned proposals, shared-archive backtests, explicit coding-agent approval, and reversible adoption events.
- Every final recommendation declares an expected-points or rank-aware objective.
- Expected-points decisions exclude ownership; rank-aware ownership enters only through simulated field outcomes.
- Projection overrides are numerical, feature-unique, uncertainty-bearing, evidence-backed, and protected from baseline double counting.
- Start-probability intervals expose estimation uncertainty separately from the probability estimate.
- Shared-player simulations compare complete structures with EV, p10, p50, p90, and optional rank utility.
- Quality gates reject club-coverage pick logic, unsupported ownership logic, and unquantified model overrides.
- Canonical decision-policy artifacts bind objective, horizon, risk mode, materiality floor, and transfer posture across optimization, simulation, evaluation, and recommendation.
- Decision evaluations classify comparisons as `CLEAR`, `NEAR_TIE`, or `UNRESOLVED`, reject clear-winner language for near-ties, and permit only quantified evidence-backed overrides.
- Transfer decisions default to rolling when the roll baseline remains inside the near-tie set.
- Pre-optimization eligibility excludes unavailable or decision-ineligible players before candidate generation, preserves typed exclusion evidence, distinguishes starter, bench, and emergency roles, and enforces scoped manager constraints with expiry.

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
- Invalid publication gates write a non-publication notice instead of an agent brief or manual checklist.

### Website

- Read-only project overview.
- Competition-state-derived current and historical gameweek index.
- Gameweek-indexed recommendation, squad, evidence-readiness, trigger, simulation, outcome, regret, and provenance views.
- Missing, provisional, live, and finalized states with archive-first historical reads.
- Calibration cohorts, source freshness, evidence gaps, and model-version lineage.
- Compatibility redirects for recommendation and squad entry points.
- Methodology and post-mortem archive pages.

### Operational State

- The local release suite contains 66 test files and 480 tests, all passing.
- Type-check, production build, cached offline refresh, store validation, worklist generation, and dossier generation pass.
- The accepted 600-player store baseline is 156.779 ms initial ingestion, 78.167 ms idempotent re-ingestion, 1150.416 ms dossier-index generation, and 2.302 ms individual dossier query on Node 24.14.1, Windows x64.
- A bounded live adapter smoke completed 48 of 50 configured UK football-news sources. The Times and talkSPORT were retained as explicit robots-blocked results; no blocked source was bypassed or counted as completed coverage.
- Refresh median was 47.768 ms bounded versus 108.170 ms sequential, and probability median was 471.204 ms for 581 players. Fixture, rules, variant, and compatibility benchmarks completed.
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
- Root provenance for club statements, press conferences, preseason lineups, predicted lineups, injuries, transfers, and odds is not yet complete enough to support strong role-security claims.
- Historical minutes remain a fallback input and must not be described as current-role confirmation.

### Start Probability and Role-Adjusted Projections

- Mutually exclusive start, substitute-appearance, and no-appearance probabilities that sum to one.
- Separate appearance probability, historical-role confidence, current-role evidence confidence, availability confidence, overall evidence confidence, and evidence uncertainty.
- Conditional-start points, conditional-substitute points, role-adjusted expectation, expected minutes, median, p10, p90, standard deviation, and football-outcome variance.
- Empirical conditional distributions when cached current-season history contains at least six starts and four substitute appearances.
- Explicit position, price, fixture, historical-role, and current-role cohort fallbacks when empirical coverage is insufficient.
- Deterministic per-player seeds, fixed sample counts, and persisted model inputs.
- Role-adjusted projections used by player pools, captain evidence, starting-XI evidence, transfer candidates, and chip thresholds while legacy raw projections remain visible for comparison.
- Full-pool probability benchmark covering 573 players and 1,000 deterministic samples per player.

Current limitation:

- Appearance states are independent in baseline probability artifacts; explicit shared-assumption scenarios model correlated club exposure separately.
- Preseason current-season histories are usually empty, so cohort fallbacks are common and remain explicitly labeled.

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

Status: delivered.

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
- Disclose the independent-appearance baseline and use explicit shared-assumption scenarios for correlated exposure.

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

Status: delivered.

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

Status: delivered.

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

Status: delivered.

## Delivered Release

### 0.0.16: Longitudinal Player Evidence, Readiness, and Triggers

Status: delivered.

Creates durable all-player evidence memory and turns uncertainty and change conditions into machine-evaluable monitoring plans while leaving responses to the agent.

Scope:

- Add an ignored local SQLite store for immutable ingestion runs, source documents, news observations, role evidence, official player snapshots, fixture-level performance, discovery coverage, and artifact lineage.
- On every refresh, retrieve and append official profiles, prices, ownership, availability, fixtures, current-season histories, minutes, points, and scoring components for every active FPL player.
- Deduplicate identical content by canonical URL and content hash while preserving append-only revisions, observation times, and prior values.
- Generate an all-player web-research worklist using player and club aliases, and record completed searches even when they find no relevant article.
- Let the coding agent ingest public-web findings with canonical URL, publisher, title, publication and retrieval times, affected players, category, short excerpt, credibility, relevance, and content hash.
- Calculate `READY`, `CAUTION`, or `INSUFFICIENT` readiness for each player and decision area from stored current-role evidence, appearance probabilities, data freshness, and source coverage.
- Let the agent assign `LOCK`, `LIKELY`, `PROVISIONAL`, or `AVOID` decision statuses.
- Reject agent classifications that are stronger than their evidence readiness permits.
- Block final verification when required rules, prices, or fixtures are stale, a starter is unsupported, or more than two intended starters have insufficient role evidence.
- Emit a provisional workspace instead of a final recommendation when a final gate fails.
- Replace each prose-only change condition with a trigger containing `triggerId`, metric, subject, operator, threshold, evidence dependency, affected decision IDs, candidate response set, re-analysis scope, next check time, and expiry.
- Support triggers for start probability, availability, price tier, source disagreement, transfer status, lineup consensus, odds movement, and competition phase.
- Evaluate triggers after every successful refresh, including when refresh is invoked at T-48h, T-24h, and T-2h checkpoints.
- Record `inactive`, `armed`, `fired`, `acknowledged`, `expired`, and `superseded` states.
- Require the coding agent to select every response; a fired trigger may request re-analysis but cannot transfer, lock, or replace a player.
- Emit missing or stale dossier warnings without blocking publication in this release; blocking enforcement begins in `0.0.17`.

Artifacts:

- `EvidenceReadinessReport`
- `DecisionStatusReport`
- `TriggerPlan`
- `TriggerEvaluation`
- `ProvisionalDecisionWorkspace`
- `PlayerEvidenceSnapshot`
- `NewsObservation`
- `PlayerPerformanceObservation`
- `DiscoveryCoverage`
- `PlayerDossier`
- `EvidenceStoreManifest`

Commands:

- `pnpm player-store:status`
- `pnpm evidence:worklist -- --gw <n|auto>`
- `pnpm evidence:ingest -- --gw <n> --input <path>`
- `pnpm player:dossier -- --player <id|name> --gw <n>`
- `pnpm benchmark:player-store`

Release gate:

- Test SQLite migrations, idempotent refreshes, full active-player coverage, content deduplication, append-only revisions, offline behavior, failed-ingestion rollback, provenance validation, readiness boundaries, stale-data failures, checkpoint evaluations, and every trigger-state transition.
- Verify that identical inputs do not create duplicate observations and that a changed source creates a linked revision without overwriting history.
- Verify that every active player receives an official snapshot and a discovery-coverage record, including explicit zero-result searches.
- Exercise concrete Kinsky first-choice, Osula start-probability, secure £4.0m defender, and Slater role-loss triggers.
- Verify that a fired trigger identifies affected decisions and counterfactual requests without choosing a squad action.
- Prove that phase changes expire or rewrite invalid trigger conditions.

## Release History and Forward Plan

### 0.0.17: Decision Mathematics and Rationale Enforcement

Make the optimization target explicit and prevent prose from overruling the declared objective without quantified, traceable model changes.

Scope:

- Require one of `MAX_EXPECTED_POINTS`, `MAX_EXPECTED_RANK`, `MINI_LEAGUE_DEFEND`, or `MINI_LEAGUE_CHASE` on every authored recommendation.
- Exclude ownership from expected-points decisions and permit it in rank-aware decisions only through a cited simulated field distribution.
- Reject club coverage as a player-selection or omission reason.
- Require every model override to identify a unique feature, numerical points delta, added uncertainty, evidence dependencies, and any competition translation model.
- Track baseline feature inputs so the same fact cannot enter both the base projection and an override.
- Expose start-probability uncertainty intervals separately from the probability point estimate.
- Compare full structures with shared player draws and expose expected points, p10, p50, p90, rank utility when applicable, and the declared objective score.
- Retain exact expected starters, automatic-substitution value, and bench-slot marginal value in squad evaluation.
- Keep every generated comparison neutral: tools expose scores and distributions but never select the final structure.

Artifacts:

- `OptimizationPolicy`
- `ProjectionFeatureAdjustment`
- `AdjustedProjection`
- `StructureSimulationReport`

Release gate:

- Test duplicate-feature and baseline-feature rejection for projection adjustments.
- Test explicit translation-model requirements for preseason and lower-league evidence.
- Test that a higher-EV structure is not penalized for ownership in expected-points mode.
- Test that rank-aware modes fail without a simulated field distribution.
- Test rationale rejection for club coverage, unsupported ownership, and unquantified model overrides.
- Verify that structure simulation never writes a selected candidate or recommendation.

### 0.0.18: Search Frontier, Correlated Simulation, and Decision Margins

Replace small hand-authored candidate comparisons with a deterministic top-N legal-squad frontier and make the probabilistic objective auditable.

Delivered:

- Exact local HiGHS mixed-integer k-best search with configurable retention of the top 1 to 1,000 legal squads.
- Monte Carlo reranking of the retained frontier with explicit search-scope metadata.
- Expected-points decomposition into starting XI, captain bonus, automatic substitutions, and vice-captain fallback.
- Shared Poisson match goals, team attacking states, and clean-sheet outcomes for correlation-aware structure distributions.
- Explicit role classes and honest labels for heuristic model-uncertainty intervals.
- Evidence-backed scenario mixtures for transfer and availability uncertainty, labeled as authored priors or empirically calibrated models.
- Common-random-number break-even sensitivity against the nearest rival candidate.
- Quality rejection of global-optimum language when probabilistic reranking covers only a bounded frontier.

### 0.0.19: Performance Outcomes, Calibration, and Postmortems

Make the first outcome review attributable and prevent the same evidence and optimization failures from recurring.

Delivered:

- Structured GW1 postmortem validation that reconciles submitted points, manager overrides, captaincy, unused bench points, and the AI counterfactual.
- A read-only postmortem page showing the selection outcome, override deltas, and recorded lessons.
- Complete simulation retention for manager and field candidates, fixture and player distributions, per-sample totals, and margin perturbations.
- Position-specific GW1 fixture difficulty in player projections and a complete captain evidence artifact for every eligible starter.
- Uncertainty-scaled player comparisons that retain every configured alternative, including the manager's Maguire and Le Fée choices.
- Publication rejection for discarded or unsimulated candidates, undersized frontiers, and incomplete exact-search optimality proofs.

Release gate:

- Validate postmortem arithmetic and the three manager overrides against the recorded GW1 outcome.
- Prove simulation reports retain every input candidate and sample total and reject truncation controls.
- Test fixture-report projection wiring, complete captain retention, alternative retention, and stale uncertainty thresholds.
- Run the full test, typecheck, and production build suites.

### 0.0.20: Incremental News Review and Evidence Readiness

Turn resumable discovery checkpoints into a bounded review workflow that produces decision-ready evidence without searching the entire player pool on every run.

Delivered:

- Prioritize the configured squad, named alternatives, transfer targets, and high-appearance players before the rest of the worklist.
- Persist bounded discovery batches independently and resume from completed player searches after interruption.
- Aggregate every checkpoint for the active worklist while retaining the originating search receipt for each candidate URL.
- Add a review queue with explicit accept, reject, duplicate, irrelevant, and deferred outcomes.
- Link every accepted article through source document, observation, player, claim category, publisher, publication time, and retrieval time.
- Rebuild dossiers and readiness reports incrementally after accepted or rejected reviews without creating a new official-data worklist.
- Expose discovery-run, search, candidate, reviewed-document, observation, and remaining-player counts in store status.
- Keep unreviewed discovery candidates separate from trusted news observations and final recommendation evidence.

Release gate:

- Interrupt and resume a multi-batch crawl without losing committed searches or repeating completed players.
- Prove repeated batches are idempotent and aggregate under the same worklist.
- Reject unreviewed, stale, duplicate, or player-mismatched articles as decision evidence.
- Verify selected-squad review can complete without crawling every active FPL player.
- Test dossier and readiness updates after each review decision.

Status: delivered.

### 0.0.21: Immutable Gameweek Archive and Forecast Calibration

Create a reproducible historical dataset that compares frozen pre-deadline forecasts with finalized official outcomes.

Delivered:

- Freeze observations, assumptions, projections, scenarios, candidates, triggers, and the agent-authored decision at each deadline.
- Append finalized fixture and gameweek performance without mutating the pre-deadline snapshot.
- Store late official corrections as linked revisions with effective timestamps and supersession lineage.
- Measure projected-points and expected-minutes error, start and appearance Brier scores, interval coverage, and calibration by probability band.
- Segment calibration by position, role-evidence state, source coverage, adapter version, and model version.
- Require at least 100 eligible player-gameweek observations before reporting a parameter-change proposal.
- Keep calibration reports descriptive; model parameters remain versioned, agent-reviewed, and unchanged by default.

Release gate:

- Prove post-deadline observations cannot enter frozen forecasts or candidate scores.
- Test idempotent final-outcome ingestion, missing fixtures, blanks, doubles, postponements, and late score corrections.
- Reproduce every calibration aggregate from archived row-level inputs.
- Reject parameter recommendations below the minimum sample threshold.

Status: delivered.

### 0.0.22: Attributable Decision Regret and Governed Model Changes

Separate bad outcomes from bad forecasts, incomplete evidence, optimization gaps, and agent decision errors.

Delivered:

- Calculate squad, transfer, captaincy, bench, chip, concentration, and substitution regret only against legal alternatives frozen before the deadline.
- Compare the submitted manager team, the agent-authored recommendation, and retained simulated candidates without introducing hindsight-only players.
- Attribute misses to source, transformation, assumption, forecast, candidate generation, simulation, evidence gap, agent decision, manager override, or normal outcome variance.
- Audit fired, missed, stale, and contradictory triggers against evidence arrival times.
- Produce versioned model-change proposals with expected benefit, affected cohorts, rollback criteria, and backtest evidence.
- Require explicit agent approval for parameter adoption and preserve the previous model for replay and rollback.

Release gate:

- Reject regret calculations that use post-deadline candidates or unavailable funds, transfers, chips, or players.
- Reconcile additive regret components to the recorded points delta without double counting.
- Test manager overrides and agent decisions as separate causal steps.
- Replay accepted and rolled-back model versions against the same archive.

Status: delivered.

### 0.0.23: Budgeted Market-Calibrated Projections

Add bookmaker evidence without allowing quota use or missing markets to manufacture precision.

Delivered:

- Ingest API-Football pre-match markets as the primary source and The Odds API as a bounded secondary source, with Football-Data as the final uncredentialed fallback.
- Retain immutable raw responses, normalized unmatched records, bookmaker prices, quota ledgers, and latest-success manifests.
- Remove bookmaker overround, deduplicate cross-provider bookmakers, and aggregate outcome probabilities by median.
- Fit market-implied Poisson goals only from complete, unambiguous evidence with RMSE at most five percentage points.
- Replace only player goal and eligible clean-sheet components, retain uncapped adjustments, and cap applied conditional-start changes at two points.
- Preserve the `0.0.13` appearance model and label every heuristic fallback.
- Regress early-season form toward neutral with a 900-minute prior and expose uncertainty-aware near ties from shared simulation samples.
- Name likely-starting squad players whose goal or clean-sheet projection still uses the heuristic fallback.

Release gate:

- Enforce API-Football limits of 12 requests per run and 24 per UTC day, plus the 50-request reserve.
- Enforce The Odds API limits of 22 credits per run, 66 per gameweek, 300 per month, three snapshots per gameweek, and a 100-credit reserve.
- Test parsing, caching, pagination stops, redaction, replay, matching, normalization, fitting, and component isolation.
- Retain every raw market, normalized record, candidate, and simulation sample.

Status: delivered.

### 0.0.24: Multi-Gameweek Decision Workspace

Replace hard-coded GW1 views with a current and historical workspace for repeated weekly operation.

Delivered:

- Resolve current, upcoming, live, and finalized gameweeks from competition state rather than fixed content imports.
- Add gameweek-indexed recommendation, squad, evidence-readiness, trigger, simulation, and postmortem views.
- Add archive navigation and compact comparisons across forecast, submitted team, outcome, and regret.
- Surface calibration cohorts, evidence gaps, source freshness, and model-version changes without turning dashboards into decision makers.
- Keep incomplete or provisional gameweeks visibly separate from finalized archives.
- Preserve the read-only boundary: no authenticated FPL session, management-page automation, or action submission.

Release gate:

- Render missing, provisional, live, and finalized gameweeks without hard-coded GW1 paths.
- Test direct navigation, archive ordering, mobile layouts, and empty calibration cohorts.
- Verify every displayed decision and metric resolves to its archived evidence and model version.
- Run Playwright checks across current and historical gameweeks without any authenticated FPL access.

Status: implementation complete; browser release-gate verification pending.

## Correctness Program: 0.0.25 to 0.0.37

The program has two goals: improve every remaining-season decision and enter the next season with a leakage-safe, calibrated, reproducible operating system. It optimizes season-long decision quality under uncertainty, not isolated weekly projections or retrospective points.

### Five-Gameweek Review Baseline

The finalized GW1 to GW5 postmortems and public manager history establish this descriptive baseline:

- The submitted team scored 326 points against a combined gameweek average of 299, a difference of +27.
- After GW5 the public history placed the team 2,196,443rd of 10,833,601 entries, approximately the top 20.3 percent; this is an observed outcome, not a target or process gate.
- The frozen AI choices would have scored 316 points. Manager overrides added 10 points, of which 8 came from the GW3 Wilson information correction.
- Four transfers produced zero immediate net points in aggregate.
- Their observed raw declared-horizon comparison through GW5 was +9, dominated by Buendía's +13. This is descriptive player scoring, not an exact squad counterfactual, because later choices, benching, captaincy, hits, and path dependence were not replayed.

| Transfer | Immediate delta | Observed raw delta through GW5 |
| --- | ---: | ---: |
| Cash to Kayode | 0 | +3 |
| João Pedro to Thiago | +1 | -5 |
| Wilson to Buendía | +1 | +13 |
| Calvert-Lewin to Wissa | -2 | -2 |
| Total | 0 | +9 |

- The AI projected 345.63 total points and its frozen choices realized 316, with a five-week mean absolute error of 10.05 points.
- Submitted captains scored 14 more points than the submitted vice-captains would have scored under the same doubling rule.
- No week is fully decision-grade: GW1 retained only the selected candidate, GW2 retained 175 invalid or unavailable candidates, GW3 has no complete archive, GW4's archive predates the active decision, and GW5 has no complete frozen decision archive.

These outcomes do not establish predictive edge, justify a player ban, or authorize automatic parameter changes. Five gameweeks are a diagnostic sample for finding process failures, not a sufficient evaluation window for model selection.

### Dual Scorecard

The project keeps publication correctness and realized performance separate:

| Scorecard | Measures | Decision use |
| --- | --- | --- |
| Process gates | Objective and horizon consistency, roll comparison, evidence freshness, eligibility, frontier completeness, active-decision integrity, submitted-state capture, archive completeness, override attribution, and review closure | Hard gates for final publication, comparability, and releases |
| Outcome metrics | Cumulative points versus average, rank percentile, forecast error and calibration, decision ordering, immediate and declared-horizon transfer value, captaincy, XI, bench, and roll comparisons | Learning and prioritization only; never proof that a past decision was correct |

Rank percentile is reported when the finalized public history contains the required population denominator. Missing outcome fields remain unavailable rather than being reconstructed from later knowledge.

### Root-Cause Register

Each supported failure has one primary owning release. Dependent releases may consume its artifact, but closure belongs to the release named here.

| Root-cause layer | Five-week evidence | Primary release | Regression fixture | Acceptance gate | Closure condition |
| --- | --- | --- | --- | --- | --- |
| Evidence and role-state failure | Wilson was assigned a 99.1% start probability despite recent 65- and 45-minute appearances and visible competition, then played 17 minutes in GW3. | `0.0.27` | Frozen Wilson GW3 role inputs and source set | Contradictory recent use blocks unsupported high confidence and produces a typed contradiction. | Selected-player role estimates are discriminative, source-qualified, snapshot-consistent, and calibrated by declared cohort. |
| Forecast calibration and false precision | Margins of 0.003 in GW2 and 0.273 in GW3 were overstated; projected AI points exceeded realized frozen-AI points by 29.63 across five weeks. | `0.0.33` | GW2 near tie, GW3 ordering, and the five-week selected-player forecast cohort | Rolling-origin champion-challenger evaluation reports calibration, ordering, interval coverage, and component error without fitting the evaluated outcomes. | A challenger passes declared calibration and ordering gates on sufficient frozen history, or the champion remains unchanged with the failure documented. |
| Eligibility and candidate-generation failure | GW2 retained 175 invalid or unavailable candidates. | `0.0.28` | Frozen GW2 candidate pool | Zero ineligible candidates enter optimization and every exclusion retains evidence, rule, and timestamp. | Eligibility is enforced before generation for starter, bench, and emergency roles with no post-hoc frontier cleanup. |
| Objective, horizon, and action-bias failure | The GW3 choice did not follow its declared objective; four transfers returned zero immediate net points; transfer optionality was treated as zero. | `0.0.26` | GW2 and GW3 roll replays plus all four observed transfer decisions | A transfer beats roll only through a `CLEAR` paired margin on the declared horizon or a typed non-model reason. | Roll, banked-transfer capacity, reachability, downside, and exact-horizon value are present for every transfer decision and the no-action hurdle is enforced. |
| Human preference and override-classification failure | The Wilson correction, a Wissa preference, and a scoped Bournemouth constraint represent materially different interventions but were not consistently typed. | `0.0.31` | GW3 Wilson correction and GW4/GW5 preference and constraint records | Every divergence is classified as information correction, manager preference, scoped constraint, or operational submission change. | Override effects can be attributed without folding human judgment into model performance. |
| Selection, submission, and archive lifecycle failure | GW4 held contradictory root, variant, decision-record, readiness, and archive states; GW5 lacks a complete frozen decision archive. | `0.0.30` | GW4 selected-but-unconfirmed state and GW5 missing-archive state | Recommended, selected, submission-pending, submitted, superseded, and archived states reconcile by hash and provenance. | Public or manager-confirmed submission is captured without mutating frozen decisions, and missing archives block decision-grade comparison. |
| Squad resilience and future-transfer-demand failure | Wilson's role fragility and Hughes's weak bench role created autosub and forced-transfer exposure not represented by unused bench points. | `0.0.32` | Combined Wilson and Hughes absence scenarios | Bench evaluation covers every valid formation under one and two absences and prices projected forced-transfer demand. | Formation-safe coverage, price-point liquidity, and future transfer demand meet policy or have a player-specific agent rationale. |
| Learning-loop and outcome-attribution failure | Missing archives prevent comparable regret; aggregate projection misses cannot yet be assigned to role, fixture, scoring, market, or selection. | `0.0.31` | GW1 to GW5 archive-completeness and attribution replay | Comparable regret is generated only from frozen evidence; forecast error reconciles to typed components; gaps remain non-comparable. | Every finalized week has a closed `RootCauseFinding` or an explicit non-comparable status before the next decision is finalized. |
| Normal outcome variance requiring no corrective model action | Wissa played 90 minutes and scored zero in GW5, an outcome that does not itself prove a role or selection defect. | `0.0.31` | Full-minute blank and high-quality low-return cases | A model change is rejected when no supported preventable causal layer exists. | The finding is classified as normal variance with no corrective action, while remaining available to cohort-level calibration. |

The learning loop is complete only when a pre-deadline decision and its evidence are frozen, the public submitted state is captured, outcomes are finalized, review findings are attributable, regression fixtures are added, changes pass governance, and the decision is replayed. Manual reconstruction may explain a gap but cannot make that week decision-grade.

### Immediate Operating Policy

These rules apply to every recommendation before the releases below are implemented:

1. One canonical objective and horizon must be declared and used by candidate generation, simulation, comparison, and the final decision. Any agent override must quantify the tradeoff against that objective.
2. A numerical leader inside the simulation stability band is a tie, not a superior pick. A transfer may beat roll only through a `CLEAR` paired margin on the declared horizon or a typed non-model reason; otherwise the decision defaults to rolling.
3. A start probability above `0.90` requires current, independent role evidence. Recent non-starts, reduced minutes, or unresolved competition must remain explicit and cannot be erased by historical minutes.
4. Unavailable and decision-ineligible players are removed before candidate generation. An emergency bench candidate must be labeled separately from a credible starter.
5. Every transfer decision must include the legal roll alternative and the effect on next-gameweek transfer capacity.
6. Every final decision must retain all generated legal candidates needed to calculate regret. If that frontier is incomplete, publication is provisional.
7. Manager overrides are recorded as separate decisions and classified as information correction, manager preference, scoped constraint, or operational submission change. They are treated as evidence in the postmortem, not folded into model performance.
8. Transfer reviews score the exact horizon declared before the deadline. Raw player-point comparisons may be reported descriptively but must not masquerade as exact squad counterfactuals.
9. Forecast error is attributed to role/minutes, fixture, scoring, market, and selection components when frozen evidence supports the split. Unsupported residuals remain unresolved or normal variance.
10. Missing, stale, or invalid archives block comparable regret. Manual reconstruction may document what is missing but cannot become decision-grade evidence.
11. Bench evaluation measures formation-safe coverage, price-point liquidity, and forced-transfer exposure rather than unused points alone.

### 0.0.25: Objective Integrity and Near-Tie Policy

Prevent the final decision from silently changing the question after optimization.

Scope:

- Add a canonical decision-policy artifact containing objective, horizon, risk mode, materiality threshold, and transfer posture.
- Require candidate generation, simulation, recommendation, and verification to reference the same policy ID.
- Classify paired simulation results as `CLEAR`, `NEAR_TIE`, or `UNRESOLVED` from uncertainty and a declared materiality floor.
- Require an agent-authored, quantified override when the final decision does not follow the declared objective leader.
- Default a transfer-versus-roll near-tie to `ROLL` unless the agent records a non-model reason.

Release gate:

- Reproduce the GW3 horizon mismatch and reject the unquantified Thiago selection.
- Reproduce the GW2 `0.003` margin and prohibit clear-winner language.
- Preserve agent ownership by rejecting inconsistent decisions without selecting a replacement.

Status: delivered.

### 0.0.26: Transfer Optionality, Enforced Roll Default, and Active Decision Lifecycle

Stop treating a free transfer as worthless when immediate expected points are nearly equal.

Scope:

- Generate a legal roll candidate for every transfer-window decision.
- Model current free transfers, the five-transfer cap, hits, bank, selling prices, and next-gameweek reachable squads.
- Report immediate gain, multi-gameweek gain, option value, replacement liquidity, and downside separately.
- Treat banked-transfer capacity and projected future transfer demand as explicit costs of acting now.
- Compare transfers over the declared horizon rather than only the next deadline.
- Permit a transfer to beat roll only through a `CLEAR` paired margin on the declared horizon or a typed non-model reason.
- Keep the option-value model versioned and visible as an assumption, not a fact.
- Publish five ranked, distinct, legal transfer options for manager choice plus the roll baseline; require the selected action to appear in that set.
- Add one atomic active-decision manifest that points to the selected authored variant, binds its recommendation and decision-record hashes, and records `selected`, `submitted`, and `archived` separately.
- Make refresh preserve a valid active-decision manifest or fail visibly; never silently replace it with `decision_record_unavailable`.
- Render the concrete sell and buy players in every actionable manual checklist.
- Store unavailable horizon values as unavailable, not numeric zero, and label the exact ranking horizon beside every option table.

Release gate:

- Replay GW2 and GW3 with the roll alternative retained and no zero-valued optionality assumption.
- Replay all four GW1 to GW5 transfers against roll, preserving their declared horizons and labeling raw player-point deltas as descriptive.
- Verify that a transfer below the near-tie threshold cannot be justified by decimal EV alone.
- Cover one-transfer, two-transfer, hit, capped-roll, and chip interactions.
- Reject short, duplicated, illegal, misranked, or selected-action-missing option sets.
- Reproduce the GW4 root/variant/decision-record split and prove that a fresh chat resolves Buendía as selected while submission remains unconfirmed.
- Reject an active manifest whose hashes, variant, gameweek, deadline, or selected candidate do not match the authored recommendation.
- Verify refresh preservation, explicit supersession, checklist transfer rendering, and unknown-horizon serialization.

Status: in progress, priority 1 and next release. Five-option publication and selection consistency are implemented; atomic active-decision promotion, transfer reachability, option-value modeling, checklist rendering, and unknown-horizon handling remain open.

### 0.0.27: Discriminative Role Probabilities, Contradiction Handling, and Calibration

Make role estimates respond to recent evidence and admit uncertainty.

Scope:

- Add recent-start, recent-minutes, substitute-use, competition, availability, and source-conflict features to role probability inputs.
- Shrink sparse early-season estimates toward explicit cohorts.
- Block start probabilities above `0.90` without qualifying current-role evidence.
- Add contradiction findings when recent usage and the probability estimate materially disagree.
- Require role probabilities to discriminate among supported role states rather than clustering at a policy ceiling.
- Separate credible starter, likely substitute, emergency bench, and unknown-role states.
- Require a selected or submitted manager decision record before a new gameweek archive can be frozen; archive verification remains idempotent after freezing.
- Rebuild readiness and decision-status artifacts from the same projection, dossier, evidence, and selected-squad snapshot used by verification.
- Record probability ceilings separately from estimates and enforce strict comparison semantics, so `0.90` never satisfies `>0.90`.
- Require a qualifying source observation behind every claim that current evidence lifts a player above the sparse-sample ceiling.

Release gate:

- Pin Wilson's GW3 inputs as a regression fixture and reject the unsupported `99.1%` estimate.
- Verify that historical minutes cannot override two recent non-start signals without current evidence.
- Report probability calibration and evidence coverage separately.
- Report selected-player calibration separately from full-pool calibration and preserve the selection rule used to form each cohort.
- Reject an unavailable decision record at the archive boundary and preserve already frozen archives unchanged.
- Reproduce the GW4 stale `0.991` readiness value beside the refreshed `0.90` projection and fail snapshot reconciliation.
- Test `>`, `>=`, rounding, display formatting, and missing-source behavior at the 90-percent boundary.

Status: in progress, priority 2. Sparse-sample probability ceilings, one-gameweek/multi-gameweek claim consistency, and the archive decision gate are implemented; snapshot reconciliation, strict threshold semantics, richer role features, and calibration reporting remain open.

### 0.0.28: Pre-Optimization Eligibility Gate

Keep impossible and unsuitable players out of the candidate frontier.

Scope:

- Evaluate availability, suspension, registration, fixture participation, current-role sufficiency, and scenario constraints before optimization.
- Give starter, bench, and emergency-only roles distinct eligibility policies.
- Persist every exclusion with its evidence, rule, and timestamp.
- Fail closed when required eligibility evidence is stale or contradictory.
- Prevent post-hoc cleanup from changing an already optimized frontier.
- Treat manager constraints as typed inputs with scope, rationale, author, creation time, expiry, and supersession. A one-week club exclusion must not become a permanent ban.
- Validate that every published option satisfies both repository legality and the active scoped manager constraints before ranking.

Release gate:

- Replay the GW2 pool and reduce retained unavailable candidates from 175 to zero.
- Prove every optimized candidate was legal and eligible at the evidence snapshot time.
- Keep exclusions inspectable without allowing the tool to select the final squad.
- Reproduce the GW4 Bournemouth instruction as a gameweek-scoped exclusion and prove it expires before GW5 candidate generation.

Status: delivered.

### 0.0.29: Complete Frozen Decision Frontiers

Make every weekly decision auditable before the deadline.

Scope:

- Define the minimum frontier for hold, transfer, captaincy, starting XI, bench order, and chip decisions.
- Retain the selected candidate, the objective leader, every near-tie, the roll baseline, and every materially discussed alternative.
- Add archive completeness and simulation coverage checks before publication.
- Block final publication when a required decision frontier or archive input is missing, invalid, or stale.
- Record why a legal candidate was excluded from analysis without inventing a score for it.
- Make incomplete frontiers visibly provisional.
- Promote one authored variant to the active decision without deleting alternative variants or rewriting immutable evidence.
- Require the active decision, canonical evaluations, top-five option set, manual checklist, and handover summary to resolve to the same candidate IDs and snapshot.

Release gate:

- Reproduce the GW1 one-candidate archive and block a claim of measurable decision regret.
- Reject publication when generated candidates are discarded or discussed alternatives are absent.
- Guarantee replayability from frozen inputs and seeds.
- Reject a workspace where the root pointer, selected variant, checklist, or decision record names a different action.

Status: planned, priority 3.

### 0.0.30: Public Submitted-State and Outcome Capture

Remove manual ambiguity about what was actually entered and what actually scored.

Scope:

- Normalize the public manager picks, transfer history, entry history, and chip responses.
- Capture submitted XI, bench, captain, vice-captain, transfers, hits, chip, and bank after the deadline.
- Reconcile the submitted state with the agent recommendation and explicit manager overrides.
- Ingest provisional and finalized outcomes with correction lineage.
- Preserve the read-only boundary and use only public endpoints.
- Model `recommended`, `selected`, `submission_pending`, `submitted`, `superseded`, and `archived` as distinct transitions with timestamps and provenance.
- Bind every transition to the active recommendation hash and reject claims that a local lock proves FPL submission.

Release gate:

- Reconstruct GW1 to GW3 submitted states from public data or report precise missing fields.
- Make repeated capture and outcome ingestion idempotent.
- Never infer a submitted action from a recommendation file.
- Reproduce the GW4 selected-but-unconfirmed Buendía state and prevent `config/squad.ts` or postmortem inputs from advancing until public or manager-confirmed submission evidence exists.

Status: planned, priority 4.

### 0.0.31: Closed-Loop Regret and Typed Root-Cause Actions

Produce a complete, attributable review before the next decision cycle.

Scope:

- Join frozen forecasts, the complete legal frontier, submitted state, manager overrides, and finalized outcomes.
- Decompose regret into candidate generation, model ordering, agent override, manager override, captaincy, XI, bench, transfer cost, and luck-sensitive residuals.
- Classify overrides as information correction, manager preference, scoped constraint, or operational submission change.
- Score transfers over the exact horizon declared before the deadline; label raw player-point comparisons as descriptive rather than exact squad counterfactuals.
- Attribute forecast error to role/minutes, fixture, scoring, market, and selection components when supported, with unresolved residuals kept explicit.
- Distinguish process errors from hindsight-only alternatives.
- Generate calibration and regret reports automatically after finalization.
- Require unresolved archive gaps to remain explicit and block comparable regret instead of replacing frozen evidence with manual reconstruction.
- Emit a versioned `RootCauseFinding` for each supported process failure or normal-variance conclusion, including its action, owning release, regression fixture, and closure state.
- Preserve superseded pre-deadline recommendations as decision history while scoring only the actual submitted state.
- Require the prior-week review and root-cause actions to be acknowledged before the next gameweek can be marked final.

Release gate:

- Produce comparable formal reports for GW1, GW2, and GW3, with non-comparable gaps labeled rather than estimated.
- Reproduce the GW1 to GW5 review and its typed override, declared-horizon transfer, forecast-attribution, and archive-comparability findings.
- Reconcile every component to submitted points and the best frozen legal candidate.
- Complete the prior-gameweek review before the next recommendation can be final.
- Reconcile the immutable earlier GW4 archive, later selected variant, and eventual submitted state without mutating any of them.

Status: planned, priority 5.

### 0.0.32: Squad Resilience, Price-Point Liquidity, and Forced-Transfer Demand

Reduce dependence on fragile starters and unusable bench slots.

Scope:

- Measure credible starters, formation-safe substitutions, role-secure bench coverage, replacement liquidity, and forced-transfer exposure.
- Measure price-point liquidity and projected forced-transfer demand across the declared horizon.
- Add squad-level limits for unknown-role and emergency-only players.
- Price the effect of a weak bench under realistic starter-absence scenarios.
- Expose cheap-player savings separately from resilience cost.
- Evaluate bench value through formation-safe coverage and absence scenarios, not unused realized points alone.
- Require an agent rationale for squads below the declared resilience floor.
- Make low-role bench players such as Hughes an explicit forced-transfer and autosub-failure risk rather than hiding them behind total bench cost.

Release gate:

- Replay the Wilson and Hughes role states as a combined squad-resilience regression fixture.
- Verify all valid formations under one and two starter absences.
- Keep resilience as a metric vector and policy constraint, not a hidden overall score.
- Reject generic risk waivers that mechanically cover every starter without player-specific evidence or a concrete change condition.

Status: planned, priority 6.

### 0.0.33: Rolling-Origin Champion-Challenger Evaluation

Turn repeated role and projection errors into controlled model improvement.

Scope:

- Add Brier score, calibration error, log loss, and interval coverage for appearance forecasts.
- Segment projection error by position, role state, evidence coverage, model version, and early-season sample size.
- Compare champion and challenger models on identical frozen archives.
- Use rolling-origin, time-ordered evaluation only; random splits and future-informed features are prohibited.
- Report full-pool and selected-player calibration separately, with the historical selection policy frozen for replay.
- Require minimum evidence, declared expected benefit, rollback criteria, and coding-agent approval before adoption.
- Track whether changes improve ordering and calibration, not only mean absolute point error.
- Version and calibrate probability ceilings, strict threshold pass rates, and source-qualified uplift separately from raw start-probability accuracy.

Release gate:

- Demonstrate that the Wilson regression fixture contributes to the relevant role cohort without directly fitting its realized outcome.
- Prove each evaluation fold uses only evidence available before its prediction cutoff.
- Reject a challenger that improves aggregate error while worsening decision ordering or high-confidence calibration.
- Preserve reversible adoption and rollback history.
- Reject a challenger that merely increases the share of players displayed above a manager threshold without improving calibration or evidence qualification.

Status: planned, priority 7.

### 0.0.34: Dual Process/Outcome Scorecard and Phase Checkpoints

Make process quality visible and prevent regression into elaborate but unauditable analysis.

Scope:

- Publish weekly process measures for objective consistency, near-tie language, role calibration, invalid-candidate count, frontier completeness, archive completeness, override attribution, and postmortem timeliness.
- Publish a separate outcome panel for cumulative points versus average, rank percentile, forecast error, decision ordering, transfer value, captaincy, XI, bench, and roll comparisons.
- Keep outcome metrics outside publication, correctness, and release gates.
- Add trend views across gameweeks and model versions.
- Add phase checkpoints after the opening block and each declared season window without automatically mutating the live model.
- Convert critical correctness measures into final-publication and release gates.
- Complete the outstanding browser verification for the multi-gameweek workspace against these measures.
- Add cross-file consistency, active-decision hash integrity, stale-derived-artifact detection, scoped-constraint expiry, and fresh-chat handover completeness to the scorecard.

Release gate:

- Require zero objective mismatches, zero retained ineligible candidates, and complete override attribution.
- Demonstrate that changing realized points or rank cannot change a publication verdict when process artifacts are unchanged.
- Display incomplete or non-comparable weeks without manufacturing a score.
- Verify current, historical, provisional, and finalized views with Playwright and no authenticated FPL access.
- Start a clean-room handover test that reads only repository instructions and active manifests, then proves it identifies the same selected action, submission state, deadline, source snapshot, and next release.

Status: planned, priority 8.

### 0.0.35: Season Freeze and Leakage-Safe Benchmarking

Turn the completed season into an immutable, time-ordered benchmark rather than a hindsight-shaped training set.

Scope:

- Freeze the completed season's evidence snapshots, decisions, submitted states, outcomes, model and policy versions, and known completeness gaps.
- Use rolling-origin replay only; prohibit random splits, future-informed features, and repaired historical inputs that were unavailable at the original cutoff.
- Compare the champion with a transparent projection baseline and a no-action transfer policy on identical frozen inputs.
- Produce a season report covering calibration, decision ordering, attributable regret, immediate and declared-horizon transfer value, and process completeness.
- Preserve non-comparable gameweeks as explicit gaps rather than excluding them silently or reconstructing them with later knowledge.

Release gate:

- Hash every season-freeze input and reproduce each evaluation fold from only the evidence available before its deadline.
- Prove the champion, transparent baseline, and no-action policy receive the same eligible information and evaluation windows.
- Report every gameweek as comparable or non-comparable with a typed reason.
- Keep season outcomes outside publication correctness and model-adoption gates.

Status: planned, priority 9.

### 0.0.36: Offseason and Preseason State Transition

Carry useful history into a new season without carrying stale current-role certainty.

Scope:

- Add season identity and explicit player continuity across changed FPL IDs, clubs, positions, prices, managers, promoted teams, and new signings.
- Retain historical performance with declared decay while resetting current-role evidence and certainty at the season boundary.
- Prevent prior-season role evidence, lineup status, and manager statements from masquerading as current-season evidence.
- Version scoring, squad, chip, transfer, price, and other rule changes before preseason analysis starts.
- Record unresolved player mappings and rule changes as blocking gaps instead of guessing continuity.

Release gate:

- Replay fixtures for retained, transferred, repositioned, promoted, newly signed, and manager-affected players.
- Prove prior-season performance remains queryable while current-role confidence resets and requires new evidence.
- Reject preseason analysis when the active rule contract is missing or still references superseded season rules.
- Preserve schema compatibility and provenance across the transition without rewriting the season freeze.

Status: planned, priority 10.

### 0.0.37: Opening Squad and Full-Season Operating Contract

Freeze the next season's decision system before GW1 and operate it through declared review windows.

Scope:

- Generate independently optimized opening structures over the first six gameweeks rather than weakening one preferred draft into alternatives.
- Compare captaincy routes, price-tier reachability, formation-safe bench resilience, bank, projected transfer demand, and role uncertainty.
- Freeze the champion model, decision policy, thresholds, eligibility rules, and baselines before the GW1 deadline.
- Define review checkpoints after the six-gameweek opening block and each existing season window.
- Require governed proposals, leakage-safe replay, and explicit adoption for changes; reviews never mutate the live model automatically.

Release gate:

- Retain independently optimized legal structures for each material opening strategy and evaluate all over the same GW1 to GW6 horizon.
- Expose structures that depend on early forced transfers, fragile bench coverage, unreachable price tiers, or unsupported role certainty.
- Reproduce the preseason freeze from hashes and reject unversioned model, policy, threshold, baseline, or rule changes after lock.
- Complete each scheduled review with separate process and outcome scorecards while preserving agent ownership of the final squad and every later decision.

Status: planned, priority 11.

## Delivery Dependencies and Migration

| Release | Depends on | Migration rule | Exit artifact used by next release |
| --- | --- | --- | --- |
| `0.0.10` | claim ledger v2 and competition state | Read v1/v2; write claim-ledger v3; report untyped legacy claims without guessing their type | Typed observations, assumptions, forecasts, decisions, and phase-valid language |
| `0.0.11` | typed claims | Convert existing adapters to root observations incrementally; uncovered adapters remain explicit gaps | Dimension-level role evidence and confidence |
| `0.0.12` | role dimensions and source confidence | Keep legacy deterministic projections for comparison only; new consumers use probabilistic projections | Appearance-state and role-adjusted player distributions |
| `0.0.13` | probabilistic projections | Generate both legacy raw totals and new utility vectors for one release | Squad utility and substitution metrics |
| `0.0.14` | squad utility | Preserve authored variants; mark unoptimized variants ineligible for structural-comparison evidence | Independently optimized legal candidate sets |
| `0.0.15` | counterfactual sets | Treat independent-player totals as baseline-only and disclose missing covariance | Concentration scenarios and shared-assumption risk |
| `0.0.16` | probabilities, scenarios, candidate requests, and public all-player inputs | Create the SQLite store additively; keep existing JSON readable; convert prose conditions to draft triggers; warn on dossier gaps | Longitudinal player dossiers, evaluated readiness, and trigger states |
| `0.0.17` | probabilistic projections, squad utility, counterfactuals, and typed evidence | Keep existing artifacts readable; require explicit objectives only on newly verified decisions | Quantified projection adjustments and probabilistic structure comparisons |
| `0.0.18` | explicit objectives and probabilistic structure comparisons | Preserve `0.0.17` simulation reports; require bounded-search language on newly verified decisions | Top-N frontier, correlated outcomes, EV decomposition, and decision margins |
| `0.0.19` | exact frontiers, retained simulations, and the first structured outcome review | Preserve every simulation input and sample; keep postmortems separate from forecasts | Attributable postmortem schema and resumable evidence foundation |
| `0.0.20` | resumable discovery and the player-intelligence store | Preserve discovery candidates as untrusted until reviewed; aggregate checkpoints by worklist | Reviewed, source-linked news evidence and incremental readiness |
| `0.0.21` | reviewed evidence, frozen decisions, and official outcomes | Append outcomes and corrections; never mutate deadline snapshots | Reproducible calibration cohorts and versioned reports |
| `0.0.22` | archived candidates, calibration, and submitted outcomes | Compare only pre-deadline legal alternatives; require agent approval for model changes | Attributable regret and reversible model proposals |
| `0.0.23` | fixture evidence and probabilistic projections | Read odds report v1/v2; retain heuristics as labeled fallback; preserve all provider and simulation inputs | Budgeted market distributions and component-scoped player adjustments |
| `0.0.24` | versioned gameweek archives and competition state | Replace fixed imports incrementally; preserve provisional and legacy artifacts | Current and historical read-only decision workspace |
| `0.0.25` | decision policies, paired simulations, and agent-authored decisions | Preserve existing objectives; require canonical policy references on newly verified decisions | Objective-consistent decisions and near-tie classifications |
| `0.0.26` | objective integrity and transfer rules | Keep immediate-EV output visible; add roll and future reachability as separate components | Transfer option-value comparisons |
| `0.0.27` | current-role evidence and frozen outcomes | Preserve prior probability versions for replay; apply guardrails only to new forecasts | Guarded and contradiction-aware role probabilities |
| `0.0.28` | guarded role probabilities and phase rules | Retain excluded-player evidence; do not rewrite historical frontiers | Pre-optimization eligibility decisions |
| `0.0.29` | eligibility and exact candidate generation | Historical incomplete frontiers remain explicitly non-comparable | Publication-grade frozen frontiers |
| `0.0.30` | public manager endpoints and archives | Normalize additively; never infer submissions from recommendations | Public submitted-state snapshots |
| `0.0.31` | complete frontiers, submitted state, and outcomes | Preserve existing postmortems; label missing historical components | Closed-loop attributable regret |
| `0.0.32` | role states and substitution utility | Keep existing utility vectors; add policy constraints without hidden scoring | Resilience and liquidity evidence |
| `0.0.33` | frozen forecasts, outcomes, and regret | Challenger models never mutate historical forecasts | Governed calibration improvements |
| `0.0.34` | all correctness releases and multi-gameweek workspace | Keep points and rank outside process-quality gates | Decision reliability scorecard |
| `0.0.35` | closed-loop regret, calibration governance, and the dual scorecard | Freeze completed-season artifacts additively; preserve gaps; evaluate only by rolling origin | Leakage-safe season benchmark and season report |
| `0.0.36` | season freeze, historical player evidence, and versioned rules | Add season identity and continuity mappings; reset current-role certainty without deleting history | Preseason state-transition manifest |
| `0.0.37` | transitioned preseason state, counterfactual generation, resilience, and transfer reachability | Freeze the champion and operating contract before GW1; require governed changes after lock | Opening-squad benchmark and full-season operating contract |

Implementation order is strict where the downstream calculation would otherwise manufacture precision. In particular:

- Counterfactual optimization does not ship before role-adjusted projections.
- Concentration penalties do not ship before independently optimized double-up and triple-up candidates exist.
- Readiness triggers do not ship before their metrics have stable, versioned definitions.
- Calibration does not alter model parameters automatically.
- Decision scorecards do not reward or punish realized points.
- Historical gaps are labeled, not repaired with hindsight.
- Season benchmarking follows closed-loop attribution, calibration governance, and dual-scorecard separation.
- Offseason transition follows the immutable season freeze and never rewrites it.
- The opening-squad contract follows the preseason transition and freezes all decision-critical versions before GW1.

Review-derived regression fixtures remain pinned through the migration:

- A fixture list can be an observation; “the fixtures justify triple exposure” cannot be a fact.
- An established historical player with weak current evidence retains high historical confidence but lower current-role confidence and start probability.
- A draft with lower raw points can only be described as more robust when its role-adjusted, expected-starter, autosub, or downside metrics improve.
- The best legal Saka-included squad and best legal Gabriel-included squad are generated independently.
- Maximum-two and triple-Man-Utd candidates are evaluated under the same strong, baseline, and weak United scenarios.
- A `PRESEASON_DRAFT` recommendation cannot warn about pre-deadline price changes.
- Kinsky role confirmation, Osula start probability, a secure £4.0m defender, and Slater role loss are represented as typed trigger evaluations rather than prose alone.

## Versioned Interfaces and Enforcement

The release sequence uses or extends versioned contracts for:

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
- `PlayerEvidenceSnapshot`
- `NewsObservation`
- `PlayerPerformanceObservation`
- `DiscoveryCoverage`
- `PlayerDossier`
- `EvidenceStoreManifest`
- `TriggerPlan`
- `SquadCandidate`
- `CounterfactualComparison`
- `ConcentrationRiskReport`
- `TransferGraph`
- `CaptaincySensitivity`
- `AgentDecisionWorkspace`
- `SelectionEvidenceReference`
- `AgentDecisionArtifact`
- `CalibrationReport`
- `RootCauseFinding`
- `DecisionScorecard`
- `SeasonFreezeManifest`
- `SeasonTransitionManifest`
- `FullSeasonOperatingContract`

`RootCauseFinding` is versioned and must record:

- schema version, gameweek, and decision type;
- frozen evidence, forecast, policy, frontier, decision, submission, and outcome references used by the finding;
- the observed failure and one supported causal layer;
- preventability as `PREVENTABLE`, `PARTIALLY_PREVENTABLE`, `NOT_PREVENTABLE`, or `UNRESOLVED`;
- immediate impact and impact over the horizon declared before the deadline, with unavailable values left unavailable;
- corrective action or an explicit no-change conclusion, plus one target release;
- the regression fixture that reproduces the finding;
- measurable closure criteria and status as `OPEN`, `IMPLEMENTED`, `VERIFIED`, or `CLOSED_NO_CHANGE`.

Its causal layer is one of evidence and role state, forecast calibration, eligibility and candidate generation, objective and action policy, human override, decision lifecycle, squad resilience, learning and attribution, or normal outcome variance. A result may cite related findings, but each finding has one primary causal layer and one owning release.

`RootCauseFinding` is introduced by `0.0.31`. `DecisionScorecard` in `0.0.34` stores process-gate verdicts separately from outcome measures. `SeasonFreezeManifest` in `0.0.35` binds completed-season evidence, decisions, versions, gaps, and rolling-origin folds. `SeasonTransitionManifest` in `0.0.36` binds season identity, player continuity, rules, and current-role resets. `FullSeasonOperatingContract` in `0.0.37` binds the pre-GW1 champion, policy, thresholds, baselines, opening horizon, and review checkpoints.

`AgentDecisionArtifact` must record:

- agent authorship;
- competition phase;
- selected action and considered alternatives;
- observation, derived-fact, assumption, and forecast dependencies;
- unresolved uncertainty;
- evidence-readiness results;
- optimized counterfactual IDs for material structural comparisons;
- concentration and robustness evidence for concentrated exposures;
- exact evidence-store snapshot and dossier references for every selected player;
- agent rationale;
- agent-authored operational trigger responses.

Enforcement rules:

- Tool outputs use evidence or candidate types that cannot be parsed as final recommendations.
- Scripts may calculate legality, projections, probabilities, robustness, concentration scenarios, sensitivity, substitution utility, transfer reachability, and optimized counterfactuals.
- Scripts must never populate final squad IDs, transfers, formation, XI, bench order, captain, vice-captain, or chip in an agent decision artifact.
- Verification rejects unsupported or illegal decisions without replacing them.
- In `0.0.16`, incomplete selected-player dossiers produce warnings; from `0.0.17`, missing or stale selected-player dossier references block final publication and produce a provisional workspace.
- Named alternatives remain warning-only unless they become selected players.
- Comparison reports may expose Pareto dominance and metric differences but must not contain `winner`, `recommendedVariant`, `selectedVariant`, or equivalent fields.
- Agent prompts require legal full-squad counterfactuals for major structural choices.
- Phase-aware validation rejects risks and rationales that are impossible in the current competition state.
- A local report cannot count as a root source when evaluating source independence.
- Artifact v1 and v2 remain readable through `0.0.22`; new claim-ledger writes use v3 after `0.0.10`.

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
| Player evidence is lost between gameweeks | `0.0.16` | Idempotent refreshes append all-player observations and revisions to a provenance-preserving SQLite store. |
| Selections do not prove evidence-tool use | `0.0.17` | Every selected player references the exact current dossier and stored observations used by the coding agent. |
| Objective drift and decimal differences create false certainty | `0.0.25` | One policy governs generation through publication and paired simulations label near ties without clear-winner language. |
| Acting is treated as free while rolling has no value | `0.0.26` | Every transfer beats an explicit roll through a clear paired margin or a typed non-model reason over the declared horizon. |
| Role probabilities ignore contradictions or cluster at a ceiling | `0.0.27` | Wilson's frozen fixture triggers contradiction handling and selected-player calibration without unsupported high confidence. |
| Invalid players enter the optimized pool | `0.0.28` | The GW2 replay admits zero ineligible candidates and preserves every exclusion reason. |
| Incomplete frontiers masquerade as measurable regret | `0.0.29` | Missing selected, leading, near-tie, roll, or discussed candidates blocks final publication and comparable regret. |
| Recommendation, selection, submission, and archive are conflated | `0.0.30` | Public or confirmed submitted state reconciles distinct lifecycle states by hash without mutating frozen decisions. |
| Overrides, transfer horizons, and forecast errors are not attributable | `0.0.31` | Typed `RootCauseFinding` records reconcile exact declared horizons and supported role, fixture, scoring, market, and selection effects. |
| Bench quality is judged by unused points or price alone | `0.0.32` | Absence scenarios expose formation-safe coverage, price-point liquidity, and projected forced-transfer demand. |
| Model changes overfit recent outcomes or leak future evidence | `0.0.33` | Champion-challenger evaluation is rolling-origin, selected-cohort aware, reversible, and frozen before each cutoff. |
| Realized points can hide a failed decision process | `0.0.34` | Process gates and outcome measures are separate panels, and outcome changes cannot alter publication verdicts. |
| Completed-season evaluation is shaped by hindsight | `0.0.35` | The immutable season freeze reports every rolling-origin fold, baseline, gap, and information cutoff. |
| Prior-season role certainty leaks into preseason | `0.0.36` | Season transition retains decayed history while resetting current-role evidence across every continuity case. |
| Opening drafts ignore captain routes, liquidity, and future transfers | `0.0.37` | Independently optimized GW1 to GW6 structures are evaluated under a frozen pre-GW1 operating contract. |

## Cross-Release Acceptance Requirements

- Preserve the authenticated-action safety boundary.
- Preserve transactional and offline evidence refresh behavior.
- Preserve cumulative, idempotent player evidence across refreshes without adding a daemon or hosted scheduler.
- Require official snapshot and discovery-coverage records for every active player.
- Keep public adapters configurable and usable without paid credentials.
- Preserve root-source attribution and content hashes through every transformation.
- Treat missing evidence as a first-class result rather than historical certainty.
- Keep evidence confidence, appearance probability, and outcome variance as separate values.
- Validate new artifacts at transactional refresh boundaries.
- Require every generated sentence template to declare compatible competition phases.
- Add unit, integration, schema, compatibility, and deterministic snapshot coverage for every release.
- Preserve existing benchmarked paths within 20 percent of their committed baselines or document and approve a new baseline.
- Add dedicated full-pool performance baselines for probability simulation, substitution utility, counterfactual generation, scenario analysis, and transfer graphs.
- Keep process-gate verdicts and outcome metrics in separate versioned scorecards; points, rank, and realized regret never make a recommendation publishable or retrospectively correct.
- Report cumulative points versus average, rank percentile when available, forecast error, decision ordering, transfer value, captaincy, XI, bench, and roll comparisons without imposing a numeric rank target.
- Require every supported root cause to map to one owning release, regression fixture, measurable acceptance gate, and closure condition through a `RootCauseFinding`.
- Score transfer reviews over the exact pre-deadline declared horizon and label raw player-point deltas as descriptive when an exact squad counterfactual is unavailable.
- Treat missing, invalid, or stale archives as non-comparable; manual reconstructions cannot satisfy decision-grade or regret gates.
- Require rolling-origin evaluation with frozen cutoffs for champion-challenger and season benchmarks; prohibit random or future-informed evaluation.
- Reset current-role certainty at season transition while preserving decayed historical performance and provenance.
- Freeze the next-season champion, policy, thresholds, baselines, and rules before GW1; no checkpoint or outcome mutates them automatically.
- Treat five-gameweek results as diagnostic evidence only, not sufficient evidence for automatic parameter changes, player bans, or predictive-edge claims.
- `0.0.35` passes only when the completed season is hash-frozen and every champion, baseline, and no-action comparison is reproducible by rolling origin.
- `0.0.36` passes only when every supported continuity case preserves history while resetting current-role certainty under a versioned next-season rule contract.
- `0.0.37` passes only when GW1 to GW6 opening structures and the full-season operating contract are frozen before GW1 and later reviews require explicit governed adoption.
- Update this roadmap's current-state section only after a release passes all of its acceptance gates.

## Deferred Limitations

- Public manager responses remain unnormalized unless a planned release requires them for frozen decision-state capture.
- Individual evidence commands remain non-transactional outside the shared refresh workflow.
- Direct player-market odds remain dependent on public availability.
- Source coverage may remain incomplete; evidence gates must expose that limitation.
- Broad public-web discovery is performed by the coding agent during the refresh workflow and ingested through repository tools; the repository does not add a mandatory search API.

## Safety Boundary

The repository does not log into FPL, store authenticated FPL cookies, automate authenticated management pages, or submit team changes. The coding agent authors recommendations, and the human applies accepted decisions manually.
