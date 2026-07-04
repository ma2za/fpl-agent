# Architecture

`fpl-agent` is a pnpm workspace for manual FPL recommendation workflows.

## Workspaces

- `apps/web` displays generated files and methodology.
- `packages/fpl-api` fetches, validates, caches, and normalizes public FPL API data.
- `packages/rules` validates squad, transfer, formation, captaincy, bench, chip, deadline, and provisional-data rules.
- `packages/engine` generates deterministic projections and evidence helpers.
- `packages/agent` builds evidence packs, renders decision prompts, evaluates recommendation quality, and verifies agent-authored files before manual use.
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
deterministic evidence generation
manual context notes
agent-authored recommendation and manual checklist
legality and quality verification
human manually applies accepted changes
postmortem records outcome
```

Milestone 5 implements deterministic evidence output and recommendation templates.

Milestone 6 implements a read-only verification gate for agent-authored recommendations.
