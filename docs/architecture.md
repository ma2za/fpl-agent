# Architecture

`fpl-agent` is a pnpm workspace for manual FPL recommendation workflows.

## Workspaces

- `apps/web` displays generated files and methodology.
- `packages/fpl-api` fetches, validates, caches, and normalizes public FPL API data.
- `packages/rules` derives competition state and validates phase actions, squad, transfer, formation, captaincy, bench, chip, deadline, and provisional-data rules.
- `packages/engine` generates legacy conditional projections, deterministic appearance-state distributions, market-or-fallback fixture goal distributions, role-adjusted projections, and evidence helpers.
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
pre-optimization starter, bench, and emergency eligibility
quota-controlled bookmaker responses and normalized fair probabilities
market-implied Poisson goals or labeled FPL-strength fallback
role-adjusted projections with separate evidence uncertainty and football variance
canonical objective, horizon, risk mode, and transfer posture
complete legal frontier including the roll baseline
paired simulation and clear, near-tie, or unresolved classification
manual context notes
schema-v2 coding-agent-authored decision with claim-ledger v3 epistemic lineage and manual checklist
legality and quality verification
deadline archive freezes every retained artifact and forecast row
human manually applies accepted changes
public submitted-state capture records the actual post-deadline team
official outcomes append revisions and feed descriptive calibration
frozen legal candidates replay into additive model, agent, and manager decision-regret components
approved model proposals create reversible version-adoption events
decision reliability scorecard separates process quality from realized points
```

Fixture evidence keeps the validated FPL schedule primary. The legacy ticker remains unchanged, while the additive horizon report separates attack and defence difficulty, records strength fallbacks and confidence, and never silently merges the separate Premier League fixture-release evidence.

Market evidence is ingested before decision evidence. API-Football is primary, The Odds API is secondary, and Football-Data is the uncredentialed fallback. Raw responses and unmatched records remain retained. Only fresh, unambiguous, complete fits with RMSE at most `0.05` replace fixture expected goals. Player adjustments replace goal and eligible clean-sheet components only; appearance, assists, bonus, and residual components remain unchanged.

Milestone 5 implements deterministic evidence output and recommendation templates.

Milestone 6 implements a read-only verification gate for agent-authored recommendations, including structured epistemic-language findings and phase-aware statement checks.
