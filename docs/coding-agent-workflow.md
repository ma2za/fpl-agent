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
- season and weekly strategy files under `packages/content/strategy`

## Agent Output

The agent should write files such as:

```txt
packages/content/recommendations/gw-{n}/recommendation.json
packages/content/recommendations/gw-{n}/agent-brief.md
packages/content/recommendations/gw-{n}/manual-checklist.md
packages/content/recommendations/gw-{n}/legality-report.json
packages/content/recommendations/gw-{n}/risk-report.md
```

`agent-brief.md` is the first file a coding agent should read for a gameweek. It separates deterministic evidence from the non-deterministic judgment checks that require current FPL news and human review.

Scripts must not select players. They can prepare evidence, projections, data status, and templates. The coding agent authors the final squad, starting XI, captaincy, bench order, transfers, and chip decision.

Every authored recommendation must include extensive `decisionAnalysis` in `recommendation.json`. For every selected player, the agent must explain why the player was picked, which named alternatives were rejected, why each alternative lost, and which evidence files support the judgment. Captaincy must compare the captain against the vice-captain and at least one other realistic captain. Key omissions must explain what would change the decision.

The coding agent also authors the weekly strategy memo and JSON before verification. Strategy files explain the season posture, weekly thesis, transfer posture, captaincy profile, chip decision, risks, and change conditions.

## Evidence Files

`pnpm recommend -- --gw {n}` writes:

```txt
data-status.json
evidence-report.json
evidence-report.md
player-pool.json
projection-summary.md
budget-tiers.json
club-exposure.json
decision-prompts.md
recommendation-template.json
strategy-evidence.json
```

Large derived evidence JSON files are local artifacts and ignored by git. Commit authored recommendation files and compact summaries, not raw generated player pools.

`pnpm evidence -- --gw {n}` refreshes `evidence-report.json` and `evidence-report.md`. The report tracks source presence and freshness for FPL data, fixtures, team news, set pieces, odds, minutes evidence, and public browser evidence. It does not select players.

`pnpm odds -- --gw {n}` writes `odds-report.json` and `odds-report.md` from the public Football-Data fixtures CSV. It is evidence-only: it can show match-level market coverage and derived team signals, but it must not choose players or hide source coverage gaps.

`pnpm team-news -- --gw {n}` writes `team-news-report.json` and `team-news-report.md` from public FPL availability fields, including selected-squad flags when a recommendation exists.

`pnpm set-pieces -- --gw {n}` writes `set-pieces-report.json` and `set-pieces-report.md` from public FPL role-order fields, including selected-squad role flags when a recommendation exists.

`pnpm minutes -- --gw {n}` writes `minutes-risk-report.json` and `minutes-risk-report.md` from public FPL historical minutes and availability fields. It labels predicted-lineup confidence as unavailable until a public predicted-lineup adapter exists.

`pnpm public-evidence -- --gw {n}` writes `public-evidence-report.json` and `public-evidence-report.md` from read-only public pages. It uses Playwright when available and falls back to public HTTP. It must not log in, persist cookies, visit authenticated FPL management pages, click team controls, or choose players.

`pnpm fixtures -- --gw {n} --horizon 6` writes fixture ticker evidence for the same gameweek folder.

`pnpm fetch:pl-fixtures -- --gw {n} --horizon 6` writes current-season fixture evidence from the official Premier League fixture release when the Fantasy Premier League API has not yet exposed current event data.

`pnpm compare:squads -- --a <recommendation.json> --b <recommendation.json>` compares two authored drafts without choosing between them.

Authored variants should live under:

```txt
packages/content/recommendations/gw-{n}/variants/{slug}/recommendation.json
```

The decision loop is:

1. Run `pnpm recommend -- --gw {n}` to refresh evidence.
2. Run source-specific evidence commands such as `pnpm team-news`, `pnpm set-pieces`, `pnpm odds`, `pnpm minutes`, and `pnpm public-evidence`.
3. Author `recommendation.json`, including `decisionAnalysis`.
4. Run `pnpm verify -- --gw {n}`.
5. Read `risk-report.md`, `agent-brief.md`, and `manual-checklist.md`; update the recommendation or author a variant if needed.
6. Compare authored variants with `pnpm compare:squads`.
7. Keep the final recommendation human-readable and manually executable.

## Quality Gates

`pnpm verify -- --gw {n}` checks legality and recommendation quality. Legality errors block. Missing required rationale and missing pick-versus-alternative analysis block. Stale data, excess bank, low-minutes starters, and club concentration are reported as warnings for agent review.

Verification also checks `packages/content/strategy/weekly/gw-{n}.json` against the recommendation and `packages/content/strategy/season-plan.md`.

Verification also writes `risk-report.json`, `risk-report.md`, `agent-brief.md`, and `manual-checklist.md`. The risk report is non-blocking and evidence-only. It may flag player risks, structure risks, fixture clusters, and missing context, but it must not recommend replacement players.

Verification also writes the evidence report and copies its freshness warnings into `legality-report.json` as non-blocking warnings.

## Hard Rules

The agent must not:

- log into FPL
- use browser automation against authenticated FPL management pages
- submit transfers
- submit captaincy changes
- submit bench changes
- activate chips
- submit team-selection changes

The human manager is the only actor who applies changes in FPL.
