# Roadmap

This document records the capabilities present through `0.0.22` and the dependency-ordered plan through `0.0.23`.

## Permanent Decision Boundary

- The repository supplies tools, evidence, calculations, validation, workspace, and guidance.
- Deterministic code may generate legal candidates and counterfactuals, but it must never select or rank the final choice.
- The coding agent makes every FPL decision: squad, transfers, formation, starting XI, bench order, captaincy, chips, decision status, and trigger response.
- The human decides whether to apply the agent's recommendation manually in the official FPL interface.
- Nothing in the repository may authenticate with FPL, retain authenticated cookies, automate management pages, or submit changes.
- Tool-produced evidence and candidate artifacts must remain structurally separate from agent-authored decision artifacts.
- Verification may reject illegal or unsupported decisions, but it must never replace them or choose an alternative.

## Current State: 0.0.22

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
- Current GW1 recommendation and risk presentation.
- Squad, methodology, and postmortem pages.

### Operational State

- The local release suite contains 56 test files and 400 tests, all passing.
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

### 0.0.23: Multi-Gameweek Decision Workspace

Replace hard-coded GW1 views with a current and historical workspace for repeated weekly operation.

Scope:

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
| `0.0.23` | versioned gameweek archives and competition state | Replace fixed imports incrementally; preserve provisional and legacy artifacts | Current and historical read-only decision workspace |

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
- Update this roadmap's current-state section only after a release passes all of its acceptance gates.

## Deferred Limitations

- Public manager responses remain unnormalized unless a planned release requires them for frozen decision-state capture.
- Individual evidence commands remain non-transactional outside the shared refresh workflow.
- Direct player-market odds remain dependent on public availability.
- Source coverage may remain incomplete; evidence gates must expose that limitation.
- Broad public-web discovery is performed by the coding agent during the refresh workflow and ingested through repository tools; the repository does not add a mandatory search API.

## Safety Boundary

The repository does not log into FPL, store authenticated FPL cookies, automate authenticated management pages, or submit team changes. The coding agent authors recommendations, and the human applies accepted decisions manually.
