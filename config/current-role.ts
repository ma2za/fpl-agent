import type { RoleEvidenceAdapterConfig } from "../packages/agent/src";

export const CURRENT_ROLE_ADAPTERS: RoleEvidenceAdapterConfig[] = [
  {
    id: "fpl-availability",
    kind: "official_availability",
    provider: "Fantasy Premier League",
    url: "https://fantasy.premierleague.com/api/bootstrap-static/",
    enabled: true,
    reliability: 1
  },
  {
    id: "manager-confirmation",
    kind: "manager_confirmation",
    provider: "Coding-agent-reviewed manager confirmation",
    url: null,
    enabled: true,
    reliability: 1
  },
  {
    id: "official-club-role",
    kind: "official_club",
    provider: "Coding-agent-reviewed official club role evidence",
    url: null,
    enabled: true,
    reliability: 1
  },
  {
    id: "preseason-lineups",
    kind: "preseason_lineup",
    provider: "Coding-agent-reviewed public preseason lineups",
    url: null,
    enabled: true,
    reliability: 1
  },
  {
    id: "predicted-lineups",
    kind: "predicted_lineup",
    provider: "Coding-agent-reviewed public predicted-lineup sources",
    url: null,
    enabled: true,
    reliability: 1
  },
  {
    id: "manual-review",
    kind: "reviewed_manual",
    provider: "Coding-agent evidence assessment",
    url: null,
    enabled: true,
    reliability: 1
  }
];
