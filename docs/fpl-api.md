# FPL API

`packages/fpl-api` uses public Fantasy Premier League API endpoints as the source of truth.

## Required Public Endpoints

```txt
https://fantasy.premierleague.com/api/bootstrap-static/
https://fantasy.premierleague.com/api/fixtures/
https://fantasy.premierleague.com/api/element-summary/{player_id}/
https://fantasy.premierleague.com/api/event/{event_id}/live/
```

## Optional Public Manager Endpoints

```txt
https://fantasy.premierleague.com/api/entry/{manager_id}/
https://fantasy.premierleague.com/api/entry/{manager_id}/event/{gameweek}/picks/
https://fantasy.premierleague.com/api/entry/{manager_id}/history/
https://fantasy.premierleague.com/api/entry/{manager_id}/transfers/
```

These endpoints are read-only and do not require private credentials.

## Client Functions

The API client exports:

```ts
createFplApiClient()
getBootstrapStatic()
getFixtures()
getPlayerSummary(playerId)
getLiveGameweek(gameweekId)
getManagerTeam(managerId)
getManagerPicks(managerId, gameweekId)
getManagerHistory(managerId)
getManagerTransfers(managerId)
```

Manager endpoints are public and read-only.

## Caching

Raw responses should be cached under `data/raw`.

```txt
data/raw/bootstrap-static.json
data/raw/fixtures.json
data/raw/element-summary/{player_id}.json
data/raw/live/gw-{gameweek}.json
```

`pnpm fetch:data` also writes timestamped snapshots:

```txt
data/raw/snapshots/{timestamp}/bootstrap-static.json
data/raw/snapshots/{timestamp}/fixtures.json
```

The repo should be able to run from cache if the public API is unavailable.

## Normalized Players

The player normalizer follows the notebook reference pattern:

- read `elements`, `element_types`, and `teams` from `bootstrap-static`
- join players to position short names
- join players to Premier League team names
- expose a compact player record with id, name, web name, price, position, team, status, expected points, form, minutes, ownership, and total points
