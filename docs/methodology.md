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

## Projection Model

The current deterministic projection uses public FPL-derived fields:

```txt
projected_points =
  base_points_per_90
  x expected_minutes_factor
  x fixture_difficulty_factor
  x availability_factor
  x form_factor
```

This model is intentionally simple and inspectable.

## Agent Selection

Final squad, starting XI, captaincy, bench order, transfer, and chip decisions are authored by the coding agent after reviewing evidence and current public context.

Scripts must not make those final calls.

## Manual Execution

The output is a checklist for a human manager.

The repo must never apply transfers, captaincy, bench, chip, or team-selection changes.
