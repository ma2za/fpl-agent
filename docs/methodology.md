# Methodology

The current recommendation model is simple, transparent, and replaceable.

## Inputs

- Public FPL API data
- Manual squad config
- Optional public manager data in a later milestone
- FPL rules
- Coding-agent-reviewed FPL news evidence with explicit credibility and relevance assessments

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

Release `0.0.12` adds a deterministic appearance-state mixture:

```txt
P(start) + P(substitute appearance) + P(no appearance) = 1

role_adjusted_points =
  P(start) x E[points | start]
  + P(substitute appearance) x E[points | substitute appearance]
```

Start, substitute, and no-appearance states use current-role evidence when present. Cached match history supplies empirical conditional minutes and points only when it contains at least six starts and four substitute appearances. Otherwise, the report names the position, price, historical-role, and fixture-adjusted cohort used as a fallback.

Every probabilistic projection persists its seed, sample count, input confidence, role support, availability factor, historical minutes, conditional sample count, and cohort. The report keeps evidence uncertainty separate from football-outcome variance and exposes raw-if-starting, role-adjusted, median, p10, p90, and standard-deviation values.

## Agent Selection

Final squad, starting XI, captaincy, bench order, transfer, and chip decisions are authored by the coding agent after reviewing evidence and current public context.

Scripts must not make those final calls.

## Manual Execution

The output is a checklist for a human manager.

The repo must never apply transfers, captaincy, bench, chip, or team-selection changes.
