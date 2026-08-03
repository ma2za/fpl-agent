# Online Player Data Setup

The repository uses public, read-only sources. It never logs into FPL or submits team changes.

## Install

```bash
corepack pnpm install
corepack pnpm exec playwright install chromium
```

Chromium is optional. Public page capture falls back to HTTP, but browser-rendered sites usually provide better text coverage.

No credential is required for the official FPL API, configured public pages, or the Football-Data fixtures CSV. Do not add FPL login cookies or credentials.

## Official Structured Player Data

Fetch one or more players by official ID, web name, full name, or an unambiguous partial name:

```bash
pnpm fetch:players -- --player Haaland --player "Bruno Fernandes"
```

Fetch every player from an authored gameweek squad:

```bash
pnpm fetch:players -- --gw 1
```

Fetch the full official player list only when required:

```bash
pnpm fetch:players -- --all --concurrency 6
```

The command retrieves the official bootstrap profile and per-player element summary. It writes ignored local files under:

```text
data/raw/bootstrap-static.json
data/raw/element-summary/{playerId}.json
data/processed/player-data/{playerId}.json
data/processed/player-data/index.json
```

Each processed player file keeps these sections separate:

- normalized profile used by repository tools;
- complete official bootstrap fields;
- upcoming fixtures;
- current-season match history;
- previous-season summaries;
- retrieval time and exact public API URLs.

## Public News and Lineup Pages

Configured sources live in `config/public-evidence.ts`. Add or remove public URLs there and declare the provider, evidence area, requirement level, and confidence.

Capture the configured pages:

```bash
pnpm public-evidence -- --gw 1 --mode auto
```

Force browser or plain HTTP capture when diagnosing a source:

```bash
pnpm public-evidence -- --gw 1 --mode browser
pnpm public-evidence -- --gw 1 --mode fetch
```

Capture a temporary source without changing configuration:

```bash
pnpm public-evidence -- --gw 1 --source-url https://example.com/player-news
```

Outputs are written under `packages/content/recommendations/gw-1/`, with raw page text under `raw-sources/public-evidence/`.

Public page capture records source URL, provider, timestamp, capture mode, title, excerpt, word count, confidence, and failure details. Captured prose is evidence for review; it is not automatically converted into a player-role claim.

## Coding-Agent Current-Role Assessment

The user is not responsible for reviewing or classifying news. The coding agent must:

1. Capture current public sources.
2. Read the underlying page text and any relevant official reports.
3. Identify the publisher and original URL.
4. Judge source credibility separately from claim relevance.
5. Record supporting, opposing, or neutral role evidence with a concise rationale.
6. Preserve disagreement and missing coverage.
7. Run the role report with the agent-authored evidence file.

The input schema requires coding-agent authorship, root source records, source IDs on every role claim, a credibility score and rationale, and a relevance score and rationale. Use `docs/examples/current-role-evidence.json` as the shape:

```bash
pnpm roles -- --gw 1 --input path/to/agent-role-evidence.json
```

The coding agent uses official club statements, manager comments, preseason lineups, and multiple predicted-lineup sources where available. It must not ask the user to supply a judgment, silently convert page text into a fact, or treat source popularity as credibility.

Credibility guidance:

| Source | Starting score | Use |
| --- | ---: | --- |
| Direct manager statement or official team news | `0.90-1.00` | Availability and stated role, limited to what was actually said |
| Official club match report or lineup | `0.85-0.95` | Observed starts, position and substitution usage |
| Current preseason lineup | `0.60-0.75` | Manager preference evidence, discounted for experimentation |
| Established predicted-lineup specialist | `0.60-0.80` | Forecast evidence, preferably combined with another independent source |
| General report with named sourcing | `0.50-0.70` | Injury, transfer or competition context |
| Aggregator, copied report or unsourced claim | `0.00-0.40` | Record only when useful for disagreement or monitoring |

Relevance is independent. A highly credible old statement may have low relevance to the upcoming fixture, while a current predicted lineup may have high relevance but only medium credibility.

## Complete Refresh

```bash
pnpm refresh -- --gw 1
pnpm fetch:players -- --gw 1
pnpm verify -- --gw 1
```

The refresh collects official FPL data, fixtures, availability, set pieces, odds, public pages, and role evidence. The player command adds detailed per-player histories for the authored squad. After refresh, the coding agent performs the news assessment and regenerates the role report without human classification.

## Source Boundaries

- Official FPL data supplies structured prices, status, ownership, history, fixtures, and FPL statistics.
- Public pages supply news, manager comments, predicted lineups, and contextual reporting that the coding agent evaluates.
- Public odds supply market-level team evidence where available.
- A local generated report is a transformation, not an independent source.
- Historical minutes do not confirm a current starting role.
- The coding agent judges credibility and relevance, reviews conflicting evidence, and authors decisions; scripts do not choose players.
