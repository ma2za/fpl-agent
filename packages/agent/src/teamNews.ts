import type { EvidenceSource, TeamNewsItem, TeamNewsReport, TeamNewsSeverity } from "./types";

type BootstrapPlayer = {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  element_type: number;
  team: number;
  status: string;
  chance_of_playing_next_round?: number | null;
  chance_of_playing_this_round?: number | null;
  news?: string;
  news_added?: string | null;
};

type BootstrapTeam = {
  id: number;
  name: string;
};

type BootstrapElementType = {
  id: number;
  singular_name_short: string;
};

type BuildTeamNewsReportInput = {
  generatedAt: string;
  gameweek: number;
  source: EvidenceSource;
  players: BootstrapPlayer[];
  teams: BootstrapTeam[];
  elementTypes: BootstrapElementType[];
  selectedPlayerIds?: number[];
};

function playerName(player: BootstrapPlayer) {
  return `${player.first_name} ${player.second_name}`.trim() || player.web_name;
}

function severity(player: BootstrapPlayer): TeamNewsSeverity {
  const chance = player.chance_of_playing_next_round;

  if (player.status === "u" || player.status === "s" || player.status === "i") {
    return "avoid";
  }

  if (player.status === "d") {
    return typeof chance === "number" && chance >= 75 ? "watch" : "risk";
  }

  if (typeof chance === "number" && chance < 75) {
    return "risk";
  }

  if (typeof chance === "number" && chance < 100) {
    return "watch";
  }

  return "info";
}

function shouldInclude(player: BootstrapPlayer) {
  return player.status !== "a" ||
    Boolean(player.news && player.news.trim().length > 0) ||
    typeof player.chance_of_playing_next_round === "number" ||
    typeof player.chance_of_playing_this_round === "number";
}

function summary(item: TeamNewsItem) {
  if (item.news.trim().length > 0) {
    return item.news;
  }

  if (typeof item.chanceOfPlayingNextRound === "number") {
    return `${item.chanceOfPlayingNextRound}% chance of playing next round.`;
  }

  return `Availability status is ${item.status}.`;
}

export function buildTeamNewsReport(input: BuildTeamNewsReportInput): TeamNewsReport {
  const teamById = new Map(input.teams.map((team) => [team.id, team.name]));
  const positionById = new Map(input.elementTypes.map((elementType) => [elementType.id, elementType.singular_name_short]));
  const selectedIds = new Set(input.selectedPlayerIds ?? []);
  const items = input.players
    .filter(shouldInclude)
    .map((player) => {
      const item: TeamNewsItem = {
        playerId: player.id,
        name: playerName(player),
        webName: player.web_name,
        teamId: player.team,
        teamName: teamById.get(player.team) ?? `Team ${player.team}`,
        position: positionById.get(player.element_type) ?? "UNK",
        status: player.status,
        chanceOfPlayingNextRound: player.chance_of_playing_next_round ?? null,
        chanceOfPlayingThisRound: player.chance_of_playing_this_round ?? null,
        news: player.news ?? "",
        newsAdded: player.news_added ?? null,
        severity: severity(player),
        selected: selectedIds.has(player.id),
        summary: ""
      };

      return {
        ...item,
        summary: summary(item)
      };
    })
    .sort((a, b) => {
      const severityOrder: Record<TeamNewsSeverity, number> = {
        avoid: 4,
        risk: 3,
        watch: 2,
        info: 1
      };

      return severityOrder[b.severity] - severityOrder[a.severity] || a.teamName.localeCompare(b.teamName) || a.webName.localeCompare(b.webName);
    });
  const warnings = items
    .filter((item) => item.selected && (item.severity === "risk" || item.severity === "avoid"))
    .map((item) => `Selected player ${item.webName} has ${item.severity} team-news severity: ${item.summary}`);

  return {
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    source: input.source,
    summary: {
      flaggedPlayers: items.length,
      selectedFlaggedPlayers: items.filter((item) => item.selected).length,
      info: items.filter((item) => item.severity === "info").length,
      watch: items.filter((item) => item.severity === "watch").length,
      risk: items.filter((item) => item.severity === "risk").length,
      avoid: items.filter((item) => item.severity === "avoid").length
    },
    items,
    warnings
  };
}

export function renderTeamNewsReportMarkdown(report: TeamNewsReport) {
  return `# Team News Report: GW${report.gameweek}

Generated: ${report.generatedAt}

Source: ${report.source.label}

## Summary

- Flagged players: ${report.summary.flaggedPlayers}
- Selected flagged players: ${report.summary.selectedFlaggedPlayers}
- Avoid: ${report.summary.avoid}
- Risk: ${report.summary.risk}
- Watch: ${report.summary.watch}
- Info: ${report.summary.info}

## Selected Squad Flags

${report.items.filter((item) => item.selected).map((item) => `- ${item.webName} (${item.teamName}, ${item.position}): ${item.severity} - ${item.summary}`).join("\n") || "- None"}

## All Flags

${report.items.map((item) => `- ${item.webName} (${item.teamName}, ${item.position}): ${item.severity} - ${item.summary}`).join("\n") || "- None"}

## Warnings

${report.warnings.map((warning) => `- ${warning}`).join("\n") || "- None"}
`;
}
