import type { EvidenceConfidence, EvidenceSource, SetPieceItem, SetPieceReport, SetPieceRole } from "./types";

type BootstrapPlayer = {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  element_type: number;
  team: number;
  status: string;
  penalties_order?: number | null;
  direct_freekicks_order?: number | null;
  corners_and_indirect_freekicks_order?: number | null;
};

type BootstrapTeam = {
  id: number;
  name: string;
};

type BootstrapElementType = {
  id: number;
  singular_name_short: string;
};

type BuildSetPieceReportInput = {
  generatedAt: string;
  gameweek: number;
  source: EvidenceSource;
  players: BootstrapPlayer[];
  teams: BootstrapTeam[];
  elementTypes: BootstrapElementType[];
  selectedPlayerIds?: number[];
};

type RoleField = {
  role: SetPieceRole;
  field: "penalties_order" | "direct_freekicks_order" | "corners_and_indirect_freekicks_order";
};

const roleFields: RoleField[] = [
  { role: "penalties", field: "penalties_order" },
  { role: "direct-free-kicks", field: "direct_freekicks_order" },
  { role: "corners-and-indirect-free-kicks", field: "corners_and_indirect_freekicks_order" }
];

function playerName(player: BootstrapPlayer) {
  return `${player.first_name} ${player.second_name}`.trim() || player.web_name;
}

function confidence(order: number, status: string): EvidenceConfidence {
  if (status !== "a") {
    return "low";
  }

  if (order === 1) {
    return "high";
  }

  if (order <= 3) {
    return "medium";
  }

  return "low";
}

function roleLabel(role: SetPieceRole) {
  if (role === "penalties") {
    return "penalties";
  }

  if (role === "direct-free-kicks") {
    return "direct free kicks";
  }

  return "corners and indirect free kicks";
}

export function buildSetPieceReport(input: BuildSetPieceReportInput): SetPieceReport {
  const teamById = new Map(input.teams.map((team) => [team.id, team.name]));
  const positionById = new Map(input.elementTypes.map((elementType) => [elementType.id, elementType.singular_name_short]));
  const selectedIds = new Set(input.selectedPlayerIds ?? []);
  const items = input.players.flatMap((player) =>
    roleFields.flatMap(({ role, field }) => {
      const order = player[field];

      if (typeof order !== "number") {
        return [];
      }

      const item: SetPieceItem = {
        playerId: player.id,
        name: playerName(player),
        webName: player.web_name,
        teamId: player.team,
        teamName: teamById.get(player.team) ?? `Team ${player.team}`,
        position: positionById.get(player.element_type) ?? "UNK",
        role,
        order,
        selected: selectedIds.has(player.id),
        status: player.status,
        confidence: confidence(order, player.status),
        summary: `${player.web_name} is order ${order} for ${roleLabel(role)}.`
      };

      return [item];
    })
  ).sort((a, b) => a.teamName.localeCompare(b.teamName) || a.role.localeCompare(b.role) || a.order - b.order);
  const warnings = items
    .filter((item) => item.selected && item.status !== "a")
    .map((item) => `Selected set-piece player ${item.webName} has status ${item.status}.`);

  return {
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    source: input.source,
    summary: {
      rolePlayers: new Set(items.map((item) => item.playerId)).size,
      selectedRolePlayers: new Set(items.filter((item) => item.selected).map((item) => item.playerId)).size,
      penaltyTakers: items.filter((item) => item.role === "penalties").length,
      directFreeKickTakers: items.filter((item) => item.role === "direct-free-kicks").length,
      cornerAndIndirectFreeKickTakers: items.filter((item) => item.role === "corners-and-indirect-free-kicks").length
    },
    items,
    warnings
  };
}

export function renderSetPieceReportMarkdown(report: SetPieceReport) {
  return `# Set Pieces Report: GW${report.gameweek}

Generated: ${report.generatedAt}

Source: ${report.source.label}

## Summary

- Role players: ${report.summary.rolePlayers}
- Selected role players: ${report.summary.selectedRolePlayers}
- Penalty takers: ${report.summary.penaltyTakers}
- Direct free-kick takers: ${report.summary.directFreeKickTakers}
- Corner and indirect free-kick takers: ${report.summary.cornerAndIndirectFreeKickTakers}

## Selected Squad Roles

${report.items.filter((item) => item.selected).map((item) => `- ${item.webName} (${item.teamName}, ${item.position}): ${item.role} order ${item.order}, ${item.confidence} confidence`).join("\n") || "- None"}

## Penalties

${report.items.filter((item) => item.role === "penalties").map((item) => `- ${item.teamName}: ${item.webName} order ${item.order} (${item.confidence})`).join("\n") || "- None"}

## Direct Free Kicks

${report.items.filter((item) => item.role === "direct-free-kicks").map((item) => `- ${item.teamName}: ${item.webName} order ${item.order} (${item.confidence})`).join("\n") || "- None"}

## Corners And Indirect Free Kicks

${report.items.filter((item) => item.role === "corners-and-indirect-free-kicks").map((item) => `- ${item.teamName}: ${item.webName} order ${item.order} (${item.confidence})`).join("\n") || "- None"}

## Warnings

${report.warnings.map((warning) => `- ${warning}`).join("\n") || "- None"}
`;
}
