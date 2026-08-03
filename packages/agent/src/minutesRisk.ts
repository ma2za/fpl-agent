import type { EvidenceConfidence, EvidenceSource, MinutesRiskItem, MinutesRiskLevel, MinutesRiskReport, RoleEvidenceRecord } from "./types";

type BootstrapPlayer = {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  element_type: number;
  team: number;
  status: string;
  minutes?: number | null;
  chance_of_playing_next_round?: number | null;
  news?: string;
};

type BootstrapTeam = {
  id: number;
  name: string;
};

type BootstrapElementType = {
  id: number;
  singular_name_short: string;
};

type BuildMinutesRiskReportInput = {
  generatedAt: string;
  gameweek: number;
  source: EvidenceSource;
  players: BootstrapPlayer[];
  teams: BootstrapTeam[];
  elementTypes: BootstrapElementType[];
  selectedPlayerIds?: number[];
  startingPlayerIds?: number[];
  benchOrder?: number[];
  predictedLineups?: RoleEvidenceRecord[];
};

function playerName(player: BootstrapPlayer) {
  return `${player.first_name} ${player.second_name}`.trim() || player.web_name;
}

function historicalConfidence(minutes: number | null, status: string): EvidenceConfidence {
  if (status !== "a" || minutes === null || minutes < 1200) {
    return "low";
  }

  if (minutes < 2400) {
    return "medium";
  }

  return "high";
}

function riskLevel(input: {
  minutes: number | null;
  status: string;
  chanceOfPlayingNextRound: number | null;
  predictedLineupSignal?: RoleEvidenceRecord["signal"];
}): MinutesRiskLevel {
  if (input.status !== "a") {
    return input.chanceOfPlayingNextRound !== null && input.chanceOfPlayingNextRound >= 75 ? "watch" : "risky";
  }

  if (input.predictedLineupSignal === "opposes_start") {
    return "risky";
  }

  if (input.predictedLineupSignal === "supports_start" && (input.minutes === null || input.minutes === 0)) {
    return "watch";
  }

  if (input.minutes === null) {
    return "unknown";
  }

  if (input.minutes === 0) {
    return "unknown";
  }

  if (input.minutes < 1200) {
    return "risky";
  }

  if (input.minutes < 2400) {
    return "watch";
  }

  return "secure";
}

function reasons(input: {
  minutes: number | null;
  status: string;
  chanceOfPlayingNextRound: number | null;
  news: string;
  predictedLineup?: RoleEvidenceRecord;
}) {
  const result: string[] = [];

  if (input.predictedLineup) {
    result.push(input.predictedLineup.note);
  } else {
    result.push("No coding-agent-reviewed predicted-lineup evidence is available for this player.");
  }

  if (input.status !== "a") {
    result.push(`FPL availability status is ${input.status}.`);
  }

  if (typeof input.chanceOfPlayingNextRound === "number" && input.chanceOfPlayingNextRound < 100) {
    result.push(`${input.chanceOfPlayingNextRound}% chance of playing next round.`);
  }

  if (input.news.trim().length > 0) {
    result.push(input.news);
  }

  if (input.minutes === null) {
    result.push("Historical minutes are unavailable.");
  } else if (input.minutes === 0) {
    result.push("No historical minutes in FPL metadata.");
  } else if (input.minutes < 1200) {
    result.push(`Low historical minutes: ${input.minutes}.`);
  } else if (input.minutes < 2400) {
    result.push(`Moderate historical minutes: ${input.minutes}.`);
  } else {
    result.push(`Strong historical minutes: ${input.minutes}.`);
  }

  return result;
}

function benchPosition(benchOrder: number[], playerId: number) {
  const index = benchOrder.indexOf(playerId);

  return index === -1 ? null : index;
}

function lineupConfidence(record: RoleEvidenceRecord | undefined): EvidenceConfidence | "unavailable" {
  if (!record) return "unavailable";
  const score = Math.min(record.credibility?.score ?? 0.5, record.sourceReliability ?? 1);
  return score >= 0.85 ? "high" : score >= 0.6 ? "medium" : "low";
}

function summary(item: MinutesRiskItem) {
  return `${item.webName}: ${item.riskLevel} minutes risk, ${item.historicalConfidence} historical confidence, ${item.predictedLineupConfidence} predicted-lineup confidence.`;
}

export function buildMinutesRiskReport(input: BuildMinutesRiskReportInput): MinutesRiskReport {
  const teamById = new Map(input.teams.map((team) => [team.id, team.name]));
  const positionById = new Map(input.elementTypes.map((elementType) => [elementType.id, elementType.singular_name_short]));
  const selectedIds = new Set(input.selectedPlayerIds ?? []);
  const startingIds = new Set(input.startingPlayerIds ?? []);
  const benchOrder = input.benchOrder ?? [];
  const predictedLineupByPlayer = new Map(
    (input.predictedLineups ?? [])
      .filter((record) => record.dimension === "predicted_lineup_consensus")
      .map((record) => [record.playerId, record])
  );
  const items = input.players.map((player) => {
    const minutes = typeof player.minutes === "number" ? player.minutes : null;
    const chanceOfPlayingNextRound = player.chance_of_playing_next_round ?? null;
    const predictedLineup = predictedLineupByPlayer.get(player.id);
    const item: MinutesRiskItem = {
      playerId: player.id,
      name: playerName(player),
      webName: player.web_name,
      teamId: player.team,
      teamName: teamById.get(player.team) ?? `Team ${player.team}`,
      position: positionById.get(player.element_type) ?? "UNK",
      status: player.status,
      minutes,
      selected: selectedIds.has(player.id),
      starting: startingIds.has(player.id),
      benchPosition: benchPosition(benchOrder, player.id),
      historicalConfidence: historicalConfidence(minutes, player.status),
      predictedLineupConfidence: lineupConfidence(predictedLineup),
      riskLevel: riskLevel({
        minutes,
        status: player.status,
        chanceOfPlayingNextRound,
        predictedLineupSignal: predictedLineup?.signal
      }),
      reasons: reasons({
        minutes,
        status: player.status,
        chanceOfPlayingNextRound,
        news: player.news ?? "",
        predictedLineup
      }),
      summary: ""
    };

    return {
      ...item,
      summary: summary(item)
    };
  }).sort((a, b) => {
    if (a.selected !== b.selected) {
      return a.selected ? -1 : 1;
    }

    if (a.starting !== b.starting) {
      return a.starting ? -1 : 1;
    }

    return a.teamName.localeCompare(b.teamName) || a.webName.localeCompare(b.webName);
  });
  const selectedItems = items.filter((item) => item.selected);
  const starterWatchOrWorse = selectedItems.filter((item) => item.starting && item.riskLevel !== "secure");
  const selectedWatchOrWorse = selectedItems.filter((item) => item.riskLevel !== "secure");
  const warnings = [
    ...(predictedLineupByPlayer.size === 0
      ? ["Predicted-lineup evidence is unavailable; minutes risk uses historical FPL minutes and availability only."]
      : []),
    ...starterWatchOrWorse.map((item) => `Selected starter ${item.webName} has ${item.riskLevel} minutes risk.`),
    ...selectedWatchOrWorse
      .filter((item) => !item.starting)
      .map((item) => `Selected bench player ${item.webName} has ${item.riskLevel} minutes risk.`)
  ];

  return {
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    source: input.source,
    summary: {
      playersReviewed: items.length,
      selectedPlayers: selectedItems.length,
      selectedStarters: selectedItems.filter((item) => item.starting).length,
      secure: selectedItems.filter((item) => item.riskLevel === "secure").length,
      watch: selectedItems.filter((item) => item.riskLevel === "watch").length,
      risky: selectedItems.filter((item) => item.riskLevel === "risky").length,
      unknown: selectedItems.filter((item) => item.riskLevel === "unknown").length,
      selectedWatchOrWorse: selectedWatchOrWorse.length,
      starterWatchOrWorse: starterWatchOrWorse.length
    },
    items: selectedItems,
    warnings
  };
}

export function renderMinutesRiskReportMarkdown(report: MinutesRiskReport) {
  const selectedItems = report.items.filter((item) => item.selected);

  return `# Minutes Risk Report: GW${report.gameweek}

Generated: ${report.generatedAt}

Source: ${report.source.label}

## Summary

- Players reviewed: ${report.summary.playersReviewed}
- Selected players: ${report.summary.selectedPlayers}
- Selected starters: ${report.summary.selectedStarters}
- Secure selected players: ${report.summary.secure}
- Watch selected players: ${report.summary.watch}
- Risky selected players: ${report.summary.risky}
- Unknown selected players: ${report.summary.unknown}
- Selected watch-or-worse: ${report.summary.selectedWatchOrWorse}
- Starter watch-or-worse: ${report.summary.starterWatchOrWorse}

## Selected Players

| Player | Team | Position | Squad role | Risk | Historical confidence | Minutes | Summary |
| --- | --- | --- | --- | --- | --- | ---: | --- |
${selectedItems.map((item) => `| ${item.webName} | ${item.teamName} | ${item.position} | ${item.starting ? "starter" : `bench ${item.benchPosition ?? "n/a"}`} | ${item.riskLevel} | ${item.historicalConfidence} | ${item.minutes ?? "n/a"} | ${item.summary} |`).join("\n") || "| None | n/a | n/a | n/a | n/a | n/a | n/a | n/a |"}

## Watch Or Worse

${selectedItems.filter((item) => item.riskLevel !== "secure").map((item) => `- ${item.webName} (${item.teamName}, ${item.position}): ${item.riskLevel} - ${item.reasons.join(" ")}`).join("\n") || "- None"}

## Warnings

${report.warnings.map((warning) => `- ${warning}`).join("\n") || "- None"}
`;
}
