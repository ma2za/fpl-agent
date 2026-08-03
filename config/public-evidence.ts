import type { PublicEvidenceSourceConfig } from "../packages/agent/src";

export const PUBLIC_EVIDENCE_SOURCES: PublicEvidenceSourceConfig[] = [
  {
    id: "premier-league-matches",
    label: "Premier League matches",
    provider: "PremierLeague.com",
    url: "https://www.premierleague.com/en/matches",
    area: "fixtures",
    required: true,
    confidence: "high"
  },
  {
    id: "fpl-scout-player-news",
    label: "FPL Scout player news",
    provider: "Fantasy Premier League",
    url: "https://fantasy.premierleague.com/the-scout/player-news",
    area: "player-news",
    required: true,
    confidence: "high"
  },
  {
    id: "ffscout-team-news",
    label: "Fantasy Football Scout team news",
    provider: "Fantasy Football Scout",
    url: "https://www.fantasyfootballscout.co.uk/team-news",
    area: "predicted-lineups",
    required: false,
    confidence: "medium"
  },
  {
    id: "rotowire-lineups",
    label: "RotoWire lineups",
    provider: "RotoWire",
    url: "https://www.rotowire.com/soccer/lineups.php",
    area: "predicted-lineups",
    required: false,
    confidence: "medium"
  },
  {
    id: "fplwatch-price-changes",
    label: "FPLWatch price changes",
    provider: "FPLWatch",
    url: "https://fplwatch.com/price-changes",
    area: "prices",
    required: false,
    confidence: "medium"
  }
];
