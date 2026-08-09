# Coding Agent Workflow

This repo is structured so a coding agent makes FPL decisions from repository evidence and workspace files.

For a fresh chat or handover, read the local `docs/agent-handoff.md` first when it exists. It is ignored because it can contain current-season state.

## Agent Inputs

- `config/squad.ts`
- `config/risk-profile.ts`
- `docs/methodology.md`
- cached public FPL API data
- detailed official player histories from `pnpm fetch:players`
- coding-agent-reviewed FPL news evidence with root-source attribution
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

`agent-brief.md` is the first file a coding agent should read for a gameweek. It separates deterministic evidence from the non-deterministic judgment checks that require current FPL news and agent review.

Scripts must not select players. They can prepare evidence, projections, data status, and templates. The coding agent authors the final squad, starting XI, captaincy, bench order, transfers, and chip decision.

Every authored recommendation must include extensive `decisionAnalysis` in `recommendation.json`. The analysis must compare full-squad structures before player-level picks, so unrelated choices are not bundled into a false binary. For every selected player, the agent must explain why the player was picked, which named alternatives were rejected, why each alternative lost, and which evidence files support the judgment. Captaincy must compare the captain against the vice-captain and at least one other realistic captain. Key omissions must explain what would change the decision.

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

All context, strategy, recommendation, evidence, and postmortem files are local season artifacts and ignored by git. Commit reusable code, schemas, fixtures, and documentation, not live-season decisions or generated reports.

`pnpm evidence -- --gw {n}` refreshes `evidence-report.json` and `evidence-report.md`. The report tracks source presence and freshness for FPL data, fixtures, team news, set pieces, odds, minutes evidence, and public browser evidence. It does not select players.

`pnpm odds -- --gw {n}` writes `odds-report.json` and `odds-report.md` from the public Football-Data fixtures CSV. It is evidence-only: it can show match-level market coverage and derived team signals, but it must not choose players or hide source coverage gaps.

`pnpm team-news -- --gw {n}` writes `team-news-report.json` and `team-news-report.md` from public FPL availability fields, including selected-squad flags when a recommendation exists.

`pnpm set-pieces -- --gw {n}` writes `set-pieces-report.json` and `set-pieces-report.md` from public FPL role-order fields, including selected-squad role flags when a recommendation exists.

`pnpm minutes -- --gw {n}` writes `minutes-risk-report.json` and `minutes-risk-report.md` from public FPL historical minutes and availability fields. It labels predicted-lineup confidence as unavailable until a public predicted-lineup adapter exists.

`pnpm public-evidence -- --gw {n}` writes `public-evidence-report.json` and `public-evidence-report.md` from read-only public pages, including official Premier League Scout evidence where configured. It uses Playwright when available and falls back to public HTTP. It must not log in, persist cookies, visit authenticated FPL management pages, click team controls, or choose players.

`pnpm fetch:players -- --gw {n}` retrieves official profile fields, fixtures, current-season history, and previous-season summaries for every player in the authored squad. Use repeated `--player <id|name>` arguments before a squad exists. See `docs/player-data-setup.md` for setup and source configuration.

After public evidence capture, the coding agent must inspect relevant source text, judge publisher credibility and claim relevance, and write `packages/content/context/agent-role-evidence.json`. It must not ask the user to classify news. Every non-historical role observation requires root source IDs, canonical URL, capture timestamps, excerpt or structured value, adapter version, content hash, underlying claim ID, and credibility and relevance rationales. Run `pnpm roles -- --gw {n}` after authoring that file.

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
3. Review player news and lineup evidence, judge credibility and relevance, author `agent-role-evidence.json`, and run `pnpm roles -- --gw {n}`.
4. Run `pnpm recommend -- --gw {n}` again so current-role evidence propagates into `probabilistic-projections.json` and `projection-uncertainty-report.json`.
5. Compare raw-if-starting output with role-adjusted expectation, appearance probabilities, p10, median, p90, and evidence uncertainty before authoring `recommendation.json`.
6. Author `recommendation.json`, including `decisionAnalysis` with structure comparisons, player comparisons, captaincy comparisons, key omissions, and evidence references.
7. Run `pnpm verify -- --gw {n}`.
8. Read `risk-report.md`, `agent-brief.md`, and `manual-checklist.md`; update the recommendation or author a variant if needed.
9. List, verify, and compare authored variants with `pnpm variant:list -- --gw {n}`, `pnpm variant:verify -- --gw {n} --variant <slug>`, and `pnpm variant:compare -- --gw {n} --a <slug> --b <slug>`.
10. Keep the final recommendation human-readable and manually executable.

Variant slugs use lowercase letters, digits, and single hyphens. Each variant keeps only its authored recommendation and derived verification files in its own directory; fixture, availability, odds, role, strategy, and freshness evidence remains shared at gameweek level. Comparison output is written under `variants/comparisons/{a}-vs-{b}/` unless `--out` is supplied. It presents differences and evidence gaps without ranking variants or choosing the final action.

## Quality Gates

`pnpm verify -- --gw {n}` checks legality and recommendation quality. Legality errors block. Missing required rationale, missing structure comparisons, missing pick-versus-alternative analysis, and ambiguous projection scope block. Stale data, excess bank, overfunded benches, low-minutes starters, fixture-upside gaps, confidence overstatement, and club concentration are reported as warnings for agent review.

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
