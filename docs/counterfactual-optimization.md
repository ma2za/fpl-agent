# Counterfactual Optimization

`pnpm counterfactuals -- --request <optimization-request.json>` solves every scenario and horizon independently. It re-optimizes every slot not fixed by the scenario.

```json
{
  "schemaVersion": 1,
  "artifactKind": "tool_evidence",
  "generatedAt": "2026-08-12T19:00:00.000Z",
  "requestId": "gw1-structures",
  "gameweek": 1,
  "horizons": [1, 3, 6],
  "scenarios": [
    {
      "id": "player-included",
      "label": "Player included",
      "constraints": {
        "budget": 100,
        "includedPlayerIds": [101]
      }
    },
    {
      "id": "club-cap-two",
      "label": "Maximum two from club 7",
      "constraints": {
        "budget": 100,
        "clubLimits": {
          "7": { "maximum": 2 }
        }
      }
    },
    {
      "id": "no-premium",
      "label": "No players at or above the premium threshold",
      "constraints": {
        "budget": 100,
        "premium": {
          "minimumPrice": 10,
          "maximum": 0
        }
      }
    }
  ],
  "objective": "role-adjusted-squad-utility",
  "modelAssumptions": [
    "Horizon values scale current role-adjusted projections by horizon length and fixture difficulty.",
    "Bench utility is an explicit reserve-value input, separate from starting-XI projection."
  ]
}
```

Constraints support:

- `includedPlayerIds` and `excludedPlayerIds`
- `minimumAppearanceProbability`
- per-club `minimum` and `maximum`
- premium-player and premium-defender price thresholds with counts
- bench minimum or maximum cost and minimum role confidence
- allowed formations

The command writes the normalized request, candidate set, optimization proofs, complete-vector comparison, and Markdown comparison. These are tool evidence and candidate artifacts, not final recommendations.
