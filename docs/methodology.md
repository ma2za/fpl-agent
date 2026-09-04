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

Release `0.0.23` de-vigs complete bookmaker outcome sets proportionally, deduplicates bookmakers across providers, and takes the median fair probability. Complete 1X2, 2.5-goal totals, and both clean-sheet probabilities are fitted to independent Poisson home and away goals. A market fit is active only while fresh, unambiguous, and at or below `0.05` RMSE; otherwise the FPL-strength heuristic remains active and labeled.

Anytime-scorer probability becomes a Poisson scoring rate over conditional appeared minutes and is distributed into start and substitute states. Only goal points and position-eligible clean-sheet points are replaced. The applied conditional-start adjustment is capped at `-2.0` to `2.0` points while the uncapped adjustment remains in the artifact. Appearance remains model `0.0.13`; points use model `0.0.23`.

## Agent Selection

Final squad, starting XI, captaincy, bench order, transfer, and chip decisions are authored by the coding agent after reviewing evidence and current public context.

Scripts must not make those final calls.

## Manual Execution

The output is a checklist for a human manager.

The repo must never apply transfers, captaincy, bench, chip, or team-selection changes.
