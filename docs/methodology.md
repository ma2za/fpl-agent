# Methodology

The first complete recommendation model should be simple, transparent, and replaceable.

## Inputs

- Public FPL API data
- Manual squad config
- Optional public manager data in a later milestone
- FPL rules
- Human-reviewed FPL news notes

## Decision Principles

- Prefer legal recommendations over aggressive optimization.
- Treat deadline status as a hard constraint.
- Prefer transparent point projections over black-box models.
- Keep chip recommendations conservative.
- Include risks and conditions that would change the decision.

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

## Manual Execution

The output is a checklist for a human manager.

The repo must never apply transfers, captaincy, bench, chip, or team-selection changes.
