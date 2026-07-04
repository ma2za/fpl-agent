# Coding Agent Workflow

This repo is structured so Codex, Claude Code, or a developer can make decisions from files.

## Agent Inputs

- `config/squad.ts`
- `config/risk-profile.ts`
- `docs/methodology.md`
- cached FPL API data from future milestones
- manually collected FPL news notes from future milestones
- manual context notes in `packages/content/context`
- previous recommendations and postmortems in `packages/content`
- generated evidence files from `pnpm recommend -- --gw {n}`

## Agent Output

The agent should write files such as:

```txt
packages/content/recommendations/gw-{n}/recommendation.json
packages/content/recommendations/gw-{n}/agent-brief.md
packages/content/recommendations/gw-{n}/manual-checklist.md
packages/content/recommendations/gw-{n}/legality-report.json
```

`agent-brief.md` is the first file a coding agent should read for a gameweek. It separates deterministic evidence from the non-deterministic judgment checks that require current FPL news and human review.

Scripts must not select players. They can prepare evidence, projections, data status, and templates. The coding agent authors the final squad, starting XI, captaincy, bench order, transfers, and chip decision.

## Evidence Files

`pnpm recommend -- --gw {n}` writes:

```txt
data-status.json
player-pool.json
projection-summary.md
budget-tiers.json
club-exposure.json
decision-prompts.md
recommendation-template.json
```

Large derived evidence JSON files are local artifacts and ignored by git. Commit authored recommendation files and compact summaries, not raw generated player pools.

## Quality Gates

`pnpm verify -- --gw {n}` checks legality and recommendation quality. Legality errors block. Missing required rationale blocks. Stale data, excess bank, low-minutes starters, and club concentration are reported as warnings for agent review.

## Hard Rules

The agent must not:

- log into FPL
- use browser automation against FPL
- submit transfers
- submit captaincy changes
- submit bench changes
- activate chips
- submit team-selection changes

The human manager is the only actor who applies changes in FPL.
