# Evidence Automation Release Plan

This plan moves `fpl-agent` from manual context notes to automated public evidence packs that a coding agent can use to author recommendations. The human manager still applies the final squad manually in the official FPL app or website.

## Decision Quality Gaps

Current GW1 recommendations are evidence-backed, but several important decision inputs are still weak or missing.

- Minutes and predicted lineups are the highest-priority gap. Starter security is currently inferred from historical minutes and FPL availability flags.
- Odds coverage exists, but the current Football-Data source has no matched GW1 Premier League rows and does not provide anytime-scorer or direct clean-sheet markets.
- Only one final recommendation is authored by default. Better decisions need several agent-authored variants that can be compared without scripts choosing the winner.
- Fixture evidence uses public FPL FDR, which is useful but too blunt for attack versus defence decisions.
- Player role evidence beyond set pieces is missing: likely starter, tactical role, attacking involvement, new-club uncertainty, and rotation risk.
- News evidence is limited to FPL availability fields and manual notes. Trusted public news sources should feed source-backed team/player notes.
- Price and ownership pressure are not summarized, so full-budget rigidity and early price-change risk are underexplained.

Priority order:

1. Release 0.5: Minutes And Predicted Lineup Evidence.
2. Release 0.6: Improved Odds Evidence.
3. Release 0.7: Public Evidence Browser.
4. Release 0.8: Authored Variant Workflow.
5. Release 0.9: Fixture Horizon Engine.
6. Release 0.10: Player Role Evidence.
7. Release 0.11: Public News Evidence.
8. Release 0.12: Price And Ownership Risk.
9. Release 0.13: App Final Selection Flow.
10. Release 0.14: Postmortem And Learning Loop.
11. Release 1.0: Recommendation-Ready Workflow.

## Release 0.1: Evidence Source Framework

Status: implemented

Goal: create the shared ingestion model used by all public evidence sources.

- Add source snapshot types for URL, fetched-at timestamp, provider name, raw excerpt path, confidence, and freshness.
- Add shared report types for `EvidenceSource`, `EvidenceItem`, `EvidenceFreshness`, and `EvidenceReport`.
- Add helpers to render evidence reports as JSON and markdown.
- Add freshness gates to `verify`: current FPL data, fixtures, team news, set pieces, odds, and minutes evidence.
- Add `.gitignore` rules for large raw source snapshots while keeping compact markdown/json reports commit-friendly.

Commands:

```bash
pnpm evidence -- --gw 1
pnpm verify -- --gw 1
```

Acceptance:

- Reports never select final players.
- Every evidence item includes source, timestamp, and confidence.
- Missing critical evidence lowers confidence or creates a warning.
- Authored recommendations must include player-by-player pick-versus-alternative analysis.

## Release 0.2: Team News Evidence

Status: partially implemented from official FPL availability fields; official Scout, Premier League injury page, and predicted-lineup adapters remain future work.

Goal: automate injuries, suspensions, transfer status, and availability notes.

- Add public-source adapters for official club/Premier League/FPL availability evidence where available.
- Write `team-news-report.json` and `team-news-report.md`.
- Normalize evidence to player/team-level notes with severity: `info`, `watch`, `risk`, `avoid`.
- Flag selected squad players with unresolved injury, suspension, transfer, or availability risk.
- Replace manual `team-news.md` as a required input; keep it only as optional override notes.

Acceptance:

- Current recommendation risk report can explain all selected player availability risks.
- Stale team-news evidence is visible in the web app and verification output.

## Release 0.3: Set Pieces And Penalties Evidence

Status: implemented from official FPL set-piece order fields.

Goal: automate penalty, corner, free-kick, and indirect set-piece evidence.

- Add `set-pieces-report.json` and `set-pieces-report.md`.
- Track per-team roles: penalties, direct free kicks, corners, indirect free kicks.
- Store role confidence and source freshness.
- Surface captaincy and premium-midfield evidence where a player has meaningful dead-ball role.
- Flag weak or unverified set-piece assumptions.

Acceptance:

- Captaincy rationale can reference current set-piece evidence.
- Recommendation verification warns when a captain or vice-captain depends on unverified set-piece assumptions.

## Release 0.4: Odds Evidence

Status: implemented from Football-Data public fixtures CSV for match-level odds; player anytime-scorer odds and direct clean-sheet markets are not available from this source.

Goal: add public market evidence for clean sheets, scoring, and team goals.

- Add odds input adapters for public/non-authenticated sources only: done for Football-Data fixtures CSV.
- Write `odds-report.json` and `odds-report.md`: done.
- Track match win/draw/loss and over/under signals: done.
- Track clean-sheet and attack signals as derived evidence, with warnings when direct markets are unavailable: done.
- Convert odds into evidence signals, not final player selections: done.
- Add odds freshness and coverage to the risk report: done.

Acceptance:

- Defensive picks can be reviewed against clean-sheet evidence.
- Captaincy can be reviewed against scorer/team-goal evidence.
- Reports show source timestamps and never require private accounts.

## Release 0.5: Minutes And Predicted Lineup Evidence

Status: partially implemented from official FPL historical minutes and availability fields; public predicted-lineup adapters remain future work.

Goal: reduce bad picks caused by non-starters and rotation.

- Add `minutes-risk-report.json` and `minutes-risk-report.md`: done.
- Combine historical minutes and current FPL availability flags: done.
- Add public predicted-lineup evidence, recent starts, transfer notes, and rotation notes: future work.
- Classify selected players as `secure`, `watch`, `risky`, or `unknown`: done.
- Add minutes confidence for every selected player: done.
- Flag likely non-starters, low-minute starters, low-minute first bench, and unknown-role enablers: partially done from historical minutes.
- Distinguish historical-minute confidence from current predicted-lineup confidence: done; predicted-lineup confidence is currently `unavailable`.
- Add specific starter and bench-cover warnings to `verify`: done.
- Show minutes risk in the web recommendation page.

Acceptance:

- Every selected starter has a visible minutes confidence label.
- Zero-minute and unknown-role players are clearly visible before final selection.
- The agent can explain why each selected starter is acceptable despite missing or weak predicted-lineup evidence.
- Reports do not propose replacement players.

## Release 0.6: Improved Odds Evidence

Status: partially implemented with market coverage labels and local public snapshot support in the report model.

Goal: make market evidence useful for captaincy, defensive picks, and high-level team attacking expectations.

- Keep the existing Football-Data fixtures CSV adapter.
- Add support for additional public/non-authenticated odds inputs where allowed.
- Add import support for a local public odds snapshot file when automated source coverage is unavailable.
- Track source coverage separately from source freshness.
- Prefer direct markets when available:
  - match win/draw/loss
  - over/under
  - team goals
  - clean sheet
  - anytime scorer
- Keep derived signals clearly labelled when direct markets are unavailable.
- Write source coverage warnings into `odds-report.md`, `risk-report.md`, and `legality-report.json`: partially done.
- Do not select players or rank replacements.

Acceptance:

- Defensive picks can be reviewed against either direct clean-sheet markets or clearly labelled derived signals.
- Captaincy can be reviewed against scorer/team-goal evidence when available.
- A missing market is reported as a coverage gap, not hidden behind a fresh source timestamp.
- Reports show source timestamps and never require private accounts.

## Release 0.7: Public Evidence Browser

Status: implemented as a read-only public page collector with Playwright support and HTTP fallback.

Goal: capture source-backed public evidence without API keys, private accounts, login, or manual user work.

- Add `public-evidence-report.json` and `public-evidence-report.md`: done.
- Capture public pages for fixtures, player news, predicted lineups, and price context: done.
- Use Playwright when available for rendered pages; fall back to plain public HTTP when Playwright is unavailable: done.
- Store raw text snapshots under ignored `raw-sources/public-evidence/`: done.
- Normalize each page into evidence signals with source URL, provider, timestamp, confidence, and severity: done.
- Add public evidence freshness to `pnpm evidence` and `pnpm verify`: done.
- Keep the safety boundary: no login, no persisted cookies, no FPL management pages, no final player selection.

Commands:

```bash
pnpm public-evidence -- --gw 1
pnpm public-evidence -- --gw 1 --mode browser
pnpm public-evidence -- --gw 1 --mode fetch
```

Acceptance:

- Every captured source has URL, provider, timestamp, and capture mode.
- Failed or low-text captures are visible warnings, not silent gaps.
- The report does not propose transfer targets, captains, squads, or replacement players.

## Release 0.8: Authored Variant Workflow

Goal: let the coding agent author multiple legal squads and compare them before choosing a final recommendation.

- Standardize variants under `packages/content/recommendations/gw-{n}/variants/{slug}/recommendation.json`.
- Add `pnpm variant:verify -- --gw 1 --variant {slug}`.
- Add `pnpm variant:compare -- --gw 1 --a {slug} --b {slug}`.
- Add `pnpm variant:list -- --gw 1`.
- Add templates for common structure tests:
  - Haaland + Bruno + Gabriel.
  - Haaland + Bruno + Saka.
  - Haaland + Saka + Gabriel, no Bruno.
  - No-Haaland balance stress test.
- Comparison summaries should include legality, budget, bank, captaincy, bench strength, fixture exposure, minutes risk, odds coverage, set-piece roles, and evidence gaps.
- Keep scripts evidence-only: variants must be authored by the coding agent, not generated by scripts.

Acceptance:

- At least three authored GW1 structures can be compared side by side.
- Comparison reports never declare a winner automatically.
- The final recommendation can cite why one authored variant was preferred.

## Release 0.9: Fixture Horizon Engine

Goal: improve fixture evidence for season and weekly strategy.

- Split fixture strength into attacking and defensive views.
- Generate 1GW, 3GW, and 6GW summaries.
- Add fixture swing detection and avoid-window notes.
- Write `fixture-horizon-report.json` and `fixture-horizon-report.md`.
- Integrate horizon summaries into `decision-prompts.md`, risk report, and weekly strategy evidence.

Acceptance:

- The agent can compare short-term captaincy, medium-term transfers, and 6GW squad structure from one report.
- High fixture-difficulty clusters are visible for selected squads and variants.

## Release 0.10: Player Role Evidence

Goal: capture player role quality beyond projections, set pieces, and raw minutes.

- Add `player-role-report.json` and `player-role-report.md`.
- Track role confidence for selected players and shortlist candidates:
  - likely starter
  - likely substitute
  - attacking role
  - defensive role
  - penalty-box involvement
  - wide creator
  - set-piece dependent
  - new-club or new-role uncertainty
  - rotation risk
- Start with deterministic signals from FPL metadata, minutes history, position, selected-by percentage, set-piece roles, and team-news flags.
- Allow source-backed manual/public notes to raise or lower role confidence.
- Flag fragile picks such as low-minute enablers, new transfers, and players whose projection depends on uncertain role assumptions.
- Do not propose replacements.

Acceptance:

- Every selected player has a visible role-confidence label.
- Players like Cherki, Wilson, Okafor, Beto, Calvert-Lewin, and Lewis-Potter can be reviewed for role risk before deadline.
- Role-risk warnings appear in `risk-report.md` and the web recommendation view.

## Release 0.11: Public News Evidence

Goal: gather source-backed team and player news without login, scraping private content, or requiring manual user work.

- Add `news-report.json` and `news-report.md`.
- Use public, non-authenticated sources only.
- Prefer high-signal sources:
  - official FPL Scout articles and updates
  - official Premier League news
  - official club injury/team-news pages
  - BBC football team news
  - reputable public match previews where accessible
- Store source URL, fetched timestamp, provider, confidence, affected teams/players, and short normalized notes.
- Classify notes as `info`, `watch`, `risk`, or `avoid`.
- De-duplicate notes across sources.
- Keep excerpts short and source-linked.
- Feed selected-player risks into `team-news-report.md` or a combined availability/news view.
- Do not use login, cookies, authenticated pages, or aggressive scraping. Read-only Playwright capture is allowed for public rendered pages.

Acceptance:

- A selected player with credible public injury, transfer, or likely-bench news is flagged.
- Every news item has a URL, source name, timestamp, and confidence.
- The agent can cite current news evidence in `recommendation.json`.

## Release 0.12: Price And Ownership Risk

Goal: expose early-season price and ownership pressure so full-budget structures and bandwagon risks are clearer.

- Add `price-risk-report.json` and `price-risk-report.md`.
- Track selected-by percentage, transfers in/out when available, price, bank, and budget rigidity.
- Flag:
  - full-budget squads
  - no-bank structures
  - low-owned punts with weak evidence
  - highly owned omissions that create rank/price pressure
  - transfer-in/out pressure once FPL event data supports it
- Summarize ownership concentration by position, club, and captaincy.
- Keep this as risk evidence, not a player selector.

Acceptance:

- A £0.0 bank recommendation has an explicit flexibility warning.
- Major omissions such as Saka can be described in risk terms.
- The report helps the agent decide whether a structure is too rigid before the human applies it.

## Release 0.13: App Final Selection Flow

Goal: let the user choose the final squad in the app from authored recommendations.

- Add recommendation and variant detail pages.
- Add side-by-side comparison views.
- Add a local `final-selection.json` marker written by the app or a CLI command.
- Show final squad, captain, vice, bench order, chip, risk report, and evidence freshness.
- Keep all FPL actions manual. The app does not log in or submit changes.

Acceptance:

- User can inspect evidence, compare variants, and mark one recommendation as final locally.
- The final screen is a manual checklist for applying changes in FPL.

## Release 0.14: Postmortem And Learning Loop

Goal: measure recommendation quality after each gameweek.

- Load actual FPL points after the gameweek.
- Compare recommendation, final selection, captaincy, bench points, and missed risks.
- Write `postmortem.json` and `postmortem.md`.
- Feed recurring mistakes into methodology and future risk checks.

Acceptance:

- Each gameweek produces a compact review of what worked, what failed, and what should change.
- No postmortem logic rewrites future recommendations automatically.

## Release 1.0: Recommendation-Ready Workflow

Goal: make the repo reliable enough for weekly use.

- One command refreshes public data and evidence.
- One verification command validates legality, evidence freshness, strategy alignment, and risk visibility.
- The web app shows current recommendation, variants, evidence, and final selection.
- The coding agent authors final recommendations from evidence.
- The human manager manually applies the selected squad.

Acceptance:

- A GW recommendation cannot be marked final unless legality passes and critical evidence freshness is visible.
- The workflow remains read-only with no FPL login, browser automation, cookies, or authenticated actions.
