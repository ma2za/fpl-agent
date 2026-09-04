# Market Odds

## Providers

- API-Football is primary for EPL fixture discovery and available pre-match markets. Market IDs are discovered from `/odds/bets` and cached for 30 days.
- The Odds API is secondary. `/events` validates the credential at zero documented credit cost. One `eu` bulk call requests `h2h,totals`; `us` event calls request `player_goal_scorer_anytime` and only request `team_totals` when API-Football lacks both clean-sheet sides.
- Football-Data remains the uncredentialed fallback for 1X2 and totals.

Credentials are read from `api_football_com` and `the_odds_api_com`. Keys are never logged, written into artifact URLs, or included in provider errors.

## Hard Budgets

| Provider | Run | Longer period | Reserve |
| --- | ---: | ---: | ---: |
| API-Football | 12 requests | 24 requests per UTC day | 50 reported daily requests |
| The Odds API | 22 credits | 66 per GW, 300 per month, 3 snapshots per GW | 100 provider credits |

API-Football uses one date-bounded fixture call and at most one odds call for each of ten fixtures. Odds snapshots remain fresh for three hours. A provider response indicating additional pages is retained and reported, but the one-request-per-fixture cap is not bypassed.

The Odds API preflights the maximum documented cost: 2 credits for bulk `h2h,totals`, 10 for scorer markets, and up to 10 more for team-total clean-sheet fallback. Actual usage is reconciled from `x-requests-last`, `x-requests-used`, and `x-requests-remaining`. A paid call is blocked when the reserve cannot be verified. `--force` bypasses freshness, not budgets.

## Artifacts

- `odds-report.json` is schema v2 and retains provider results, raw bookmaker outcomes, implied and fair probabilities, overround, de-vig method, fixture and player match state, source IDs, and quota headers. The reader continues to accept schema v1.
- `fixture-distributions.json` contains market-implied or labeled fallback Poisson distributions and is loaded automatically by a sibling frontier simulation request.
- `market-projection-features.json` contains fresh scorer and clean-sheet inputs for points model `0.0.23`.
- `data/raw/odds/snapshots` stores immutable timestamped, content-addressed responses. Provider `latest-success.json` files point to the newest successful snapshot, and `quota-ledger.json` retains local usage.

## References

- [API-Football pricing](https://www.api-football.com/pricing)
- [The Odds API request costs](https://the-odds-api.com/liveapi/guides/v4/)
- [The Odds API markets](https://the-odds-api.com/sports-odds-data/betting-markets.html)
