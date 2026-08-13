# Correlated Scenario Analysis

`pnpm concentration` evaluates independently optimized counterfactual squads under shared club assumptions. It does not choose a squad.

```bash
pnpm concentration -- \
  --graph path/to/shared-assumption-graph.json \
  --scenarios path/to/club-scenario-sets.json \
  --counterfactuals path/to/counterfactual-set.json \
  --players path/to/concentration-players.json \
  --penalty 0.5 \
  --out path/to/output
```

The graph declares assumptions of type `team_attack`, `team_defense`, `tactical_role`, `clean_sheet_environment`, `penalties`, or `manager_selection`. Each dependency links a player to one assumption with a point sensitivity.

Each club scenario set must contain `strong`, `baseline`, and `weak` scenarios whose probabilities sum to one. A scenario supplies a numeric shock for each affected assumption. Player utility in that scenario is:

```txt
baselineUtility + sum(assumption shock * player sensitivity)
```

`concentration-players.json` is an array of:

```json
{
  "playerId": 1,
  "teamId": 1,
  "baselineUtility": 6.2
}
```

The command writes `shared-assumption-graph.json`, `club-scenario-sets.json`, `concentration-risk-report.json`, `scenario-comparison.json`, and `scenario-comparison.md`. The report includes pairwise covariance, squad variance, club and assumption concentration, correlated p10, scenario regret, player downside contributions, and a separately disclosed concentration penalty.

The penalty equals the configured weight multiplied by correlated squad standard deviation. A zero weight leaves expected utility unchanged.
