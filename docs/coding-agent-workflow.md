# Coding Agent Workflow

This repo is structured so Codex, Claude Code, or a developer can make decisions from files.

## Agent Inputs

- `config/squad.ts`
- `config/risk-profile.ts`
- `docs/methodology.md`
- cached FPL API data from future milestones
- manually collected FPL news notes from future milestones
- previous recommendations and postmortems in `packages/content`

## Agent Output

The agent should write files such as:

```txt
packages/content/recommendations/gw-{n}/recommendation.json
packages/content/recommendations/gw-{n}/manual-checklist.md
packages/content/recommendations/gw-{n}/legality-report.json
```

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
