# Methodology

The current recommendation model is simple, transparent, and replaceable.

## Inputs

- Public FPL API data
- Manual squad config
- Optional public manager data in a later milestone
- FPL rules
- Coding-agent-reviewed FPL news evidence with explicit credibility and relevance assessments
- Optional quota-controlled pre-match bookmaker evidence

## Decision Principles

- Prefer legal recommendations over aggressive optimization.
- Treat deadline status as a hard constraint.
- Use transparent point projections as evidence, not as automatic player selection.
- Keep chip recommendations conservative.
- Include risks and conditions that would change the decision.
- Separate source observations, deterministic derived facts, assumptions, forecasts, and decisions.
- Keep evaluative language out of observations and derived facts unless it is an attributed source quote.
- Use phase-aware warnings, including budget-path language instead of price-rise or transfer-hit warnings during preseason drafting.
- Trace every current-role claim to a root publisher and observation while retaining per-dimension disagreement and missing coverage.

## Weekly Decision Policy

Every gameweek uses one canonical policy covering the objective, horizon, risk mode, materiality threshold, and transfer posture. Candidate generation, simulation, comparison, and the final recommendation must answer that same question.

Release `0.0.25` represents this policy as a versioned `decision_policy` artifact and requires its policy ID on optimization and decision-evaluation records. Policy-bound simulations emit model version `0.0.25` with `CLEAR` or `NEAR_TIE` stability status; evaluations without enough comparison evidence use `UNRESOLVED`.

- A final decision that differs from the declared objective leader requires an agent-authored quantified tradeoff. Verification rejects an unexplained mismatch but never selects the replacement.
- Paired simulations inside the declared stability band are `NEAR_TIE`. Small positive point estimates are not evidence of a clear winner.
- Every transfer comparison includes the legal roll alternative, current and future free-transfer capacity, hits, bank, selling prices, and next-gameweek squad reachability.
- When a transfer and roll are a near-tie, the operating default is to roll. The agent may override that default with a documented non-model reason.
- Unavailable and decision-ineligible players are excluded before candidate generation. Starter, bench, and emergency-only eligibility are distinct.
- A start probability above `0.90` requires current independent role evidence. Historical minutes cannot erase recent non-starts, reduced minutes, competition, or source conflict.
- The frozen frontier retains the selected candidate, objective leader, roll baseline, every near-tie, and every materially discussed alternative.
- A recommendation is provisional when its objective is inconsistent, its eligibility evidence is unresolved, or its frontier cannot support archive-backed regret.

Realized points evaluate outcomes, not whether the pre-deadline process was sound. Model and process changes require frozen evidence and must not be justified with hindsight-only alternatives.

## Projection Model

The legacy conditional projection remains visible for comparison:

```txt
projected_points =
  base_points_per_90
  x expected_minutes_factor
  x fixture_difficulty_factor
  x availability_factor
  x form_factor
```

The form factor is regressed toward `1.0` with a 900-minute prior. A single early-season return therefore cannot receive the full form multiplier; its influence increases only as observed minutes accumulate.

Release `0.0.12` adds a deterministic appearance-state mixture:

```txt
P(start) + P(substitute appearance) + P(no appearance) = 1

role_adjusted_points =
  P(start) x E[points | start]
  + P(substitute appearance) x E[points | substitute appearance]
```

Start, substitute, and no-appearance states use current-role evidence when present. Cached match history supplies empirical conditional minutes and points only when it contains at least six starts and four substitute appearances. Otherwise, the report names the position, price, historical-role, and fixture-adjusted cohort used as a fallback.

Every probabilistic projection persists its seed, sample count, input confidence, role support, availability factor, historical minutes, conditional sample count, and cohort. The report keeps evidence uncertainty separate from football-outcome variance and exposes raw-if-starting, role-adjusted, median, p10, p90, and standard-deviation values.

Release `0.0.27` adds recent league starts, minutes, substitute use, other-competition samples, availability gaps, and source conflicts as explicit role inputs. Sparse samples remain shrunk toward a named cohort. Forecasts separately expose calibration state and evidence coverage, classify `CREDIBLE_STARTER`, `LIKELY_SUBSTITUTE`, `EMERGENCY_BENCH`, and `UNKNOWN_ROLE`, and record contradictions between recent use and high start estimates.

Release `0.0.28` evaluates official availability, suspension, registration, scheduled-fixture participation, current-role sufficiency, evidence freshness, and typed manager constraints before counterfactual optimization. Starter, bench, and emergency roles have separate policies. Every exclusion is persisted with its rule, evidence identifiers, and timestamp, and every generated candidate is bound to the eligibility snapshot used by the optimizer. Manager constraints declare their gameweek scope, author, rationale, creation time, optional expiry, and supersession so temporary instructions cannot silently become permanent exclusions.

The sparse-data ceiling is `0.90`. A displayed `90%` value does not satisfy a strict `>0.90` comparison, and every lift over that ceiling requires at least one named, current, start-supporting source observation. Evidence readiness and decision status carry one hash-bound snapshot over projections, dossier index, current-role evidence, and selected players; verification and archive freeze reject component drift.

Max-expected-points simulations report a decision-stability band rather than treating the numerical leader as uniquely supported. The band uses paired candidate differences from the shared simulation samples, a 95 percent normal interval, and a minimum material margin of `0.15` points. Every candidate inside that band remains available for agent judgment.

Release `0.0.23` de-vigs complete bookmaker outcome sets proportionally, deduplicates bookmakers across providers, and takes the median fair probability. Complete 1X2, 2.5-goal totals, and both clean-sheet probabilities are fitted to independent Poisson home and away goals. A market fit is active only while fresh, unambiguous, and at or below `0.05` RMSE; otherwise the FPL-strength heuristic remains active and labeled.

Anytime-scorer probability becomes a Poisson scoring rate over conditional appeared minutes and is distributed into start and substitute states. Only goal points and position-eligible clean-sheet points are replaced. The applied conditional-start adjustment is capped at `-2.0` to `2.0` points while the uncapped adjustment remains in the artifact. Appearance uses model `0.0.27`; points use model `0.0.23`.

When scorer or clean-sheet prices are missing for a current-squad player with at least `0.90` start probability, the recommendation evidence names the affected player ID and the active heuristic fallback.

## Agent Selection

Final squad, starting XI, captaincy, bench order, transfer, and chip decisions are authored by the coding agent after reviewing evidence and current public context.

Scripts must not make those final calls.

## Manual Execution

The output is a checklist for a human manager.

The repo must never apply transfers, captaincy, bench, chip, or team-selection changes.
