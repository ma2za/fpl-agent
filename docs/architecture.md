# Architecture

`fpl-agent` is a pnpm workspace for manual FPL recommendation workflows.

## Workspaces

- `apps/web` displays generated files and methodology.
- `packages/fpl-api` fetches, validates, caches, and normalizes public FPL API data.
- `packages/rules` validates squad, transfer, formation, captaincy, bench, chip, deadline, and provisional-data rules.
- `packages/engine` generates deterministic projections, captain rankings, bench order, chip recommendations, and transfer candidates.
- `packages/agent` will write recommendation, checklist, and postmortem files for coding-agent review.
- `packages/content` stores generated recommendations and postmortems.

## Safety Boundary

The system is read-only with respect to Fantasy Premier League.

No package may implement FPL login, session cookies, browser automation, or authenticated POST requests that change a team.

## Data Flow

```txt
public FPL API and local config
cached raw data
normalized data
rules validation
deterministic recommendation engine
manual checklist and machine-readable JSON
human manually applies accepted changes
postmortem records outcome
```

Milestone 4 implements the first deterministic decision layer for future recommendation output.
