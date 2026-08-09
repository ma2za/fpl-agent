# Architecture

`fpl-agent` is a pnpm workspace for manual FPL recommendation workflows.

## Workspaces

- `apps/web` displays generated files and methodology.
- `packages/fpl-api` fetches, validates, caches, and normalizes public FPL API data.
- `packages/rules` derives competition state and validates phase actions, squad, transfer, formation, captaincy, bench, chip, deadline, and provisional-data rules.
- `packages/engine` generates legacy conditional projections, deterministic appearance-state distributions, role-adjusted projections, and evidence helpers.
- `packages/agent` builds evidence packs, validates claim provenance, renders decision prompts, evaluates recommendation quality, and verifies agent-authored files before manual use.
- `packages/content` is an ignored local workspace for season context, strategy, recommendations, evidence, and postmortems.

## Safety Boundary

The system is read-only with respect to Fantasy Premier League.

No package may implement FPL login, session cookies, browser automation, or authenticated POST requests that change a team.

## Data Flow

```txt
public FPL API and local config
cached raw data
normalized data
rules validation
source-grounded current-role observations
deterministic start, substitute, and no-appearance distributions
role-adjusted projections with separate evidence uncertainty and football variance
manual context notes
schema-v2 coding-agent-authored decision with claim-ledger v3 epistemic lineage and manual checklist
legality and quality verification
human manually applies accepted changes
postmortem records outcome
```

Fixture evidence keeps the validated FPL schedule primary. The legacy ticker remains unchanged, while the additive horizon report separates attack and defence difficulty, records strength fallbacks and confidence, and never silently merges the separate Premier League fixture-release evidence.

Milestone 5 implements deterministic evidence output and recommendation templates.

Milestone 6 implements a read-only verification gate for agent-authored recommendations, including structured epistemic-language findings and phase-aware statement checks.
