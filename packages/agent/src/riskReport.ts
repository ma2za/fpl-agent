import { DEFAULT_STARTING_BUDGET, MAX_PLAYERS_PER_CLUB } from "../../rules/src";
import type {
  EvidenceGap,
  FixtureTicker,
  MinutesRiskReport,
  OddsReport,
  PlayerRisk,
  PublicEvidenceReport,
  RiskLevel,
  SetPieceReport,
  SquadRiskReport,
  StructureRisk,
  TeamNewsReport,
  WeeklyRecommendation
} from "./types";

type BuildSquadRiskReportInput = {
  generatedAt: string;
  recommendation: WeeklyRecommendation;
  dataStatus?: {
    dataMode?: "official" | "provisional";
  } | null;
  fixtureTicker?: FixtureTicker | null;
  teamNewsReport?: TeamNewsReport | null;
  setPieceReport?: SetPieceReport | null;
  oddsReport?: OddsReport | null;
  minutesRiskReport?: MinutesRiskReport | null;
  publicEvidenceReport?: PublicEvidenceReport | null;
  contextNotes: {
    teamNews: string;
    setPieces: string;
    watchlist: string;
  };
};

const positions = ["GKP", "DEF", "MID", "FWD"];

function totalPrice(recommendation: WeeklyRecommendation) {
  return Number(recommendation.squadBefore.players.reduce((sum, player) => sum + player.price, 0).toFixed(1));
}

function levelScore(level: RiskLevel) {
  if (level === "high") {
    return 3;
  }

  if (level === "medium") {
    return 2;
  }

  return 1;
}

function highestLevel(levels: RiskLevel[]) {
  return levels.sort((a, b) => levelScore(b) - levelScore(a))[0] ?? "low";
}

function isReviewed(text: string) {
  return /^Reviewed:\s*yes\s*$/im.test(text) || /\[[xX]\]/.test(text);
}

function evidenceGap(area: string, text: string, missingMessage: string): EvidenceGap {
  return isReviewed(text)
    ? {
      area,
      status: "reviewed",
      message: `${area} context has been reviewed.`
    }
    : {
      area,
      status: "missing",
      message: missingMessage
    };
}

function benchPosition(recommendation: WeeklyRecommendation, playerId: number) {
  const index = recommendation.pickTeam.benchOrder.indexOf(playerId);
  return index === -1 ? null : index;
}

function fixtureDifficultyByTeam(fixtureTicker: FixtureTicker | null | undefined, gameweek: number) {
  const difficulties = new Map<number, number>();

  for (const team of fixtureTicker?.teams ?? []) {
    const fixture = team.fixtures.find((item) => item.event === gameweek) ?? team.fixtures[0];

    if (fixture) {
      difficulties.set(team.teamId, fixture.difficulty);
    }
  }

  return difficulties;
}

function buildPlayerRisks(input: BuildSquadRiskReportInput) {
  const startingIds = new Set(input.recommendation.pickTeam.startingXI);
  const difficultyByTeam = fixtureDifficultyByTeam(input.fixtureTicker, input.recommendation.gameweek);
  const risks: PlayerRisk[] = [];

  for (const player of input.recommendation.squadBefore.players) {
    const reasons: string[] = [];
    const levels: RiskLevel[] = [];
    const starting = startingIds.has(player.id);
    const minutes = player.minutes ?? null;
    const difficulty = difficultyByTeam.get(player.teamId) ?? null;

    if (player.status !== "a") {
      reasons.push(`Availability status is ${player.status}.`);
      levels.push(starting ? "high" : "medium");
    }

    if (minutes === 0) {
      reasons.push("No historical minutes in the available FPL metadata.");
      levels.push(starting ? "high" : "medium");
    } else if (typeof minutes === "number" && minutes > 0 && minutes < 1200) {
      reasons.push(`Low historical minutes in the available FPL metadata: ${minutes}.`);
      levels.push(starting ? "medium" : "low");
    }

    if (typeof difficulty === "number" && difficulty >= 4) {
      reasons.push(`High immediate fixture difficulty: FDR ${difficulty}.`);
      levels.push(starting ? "medium" : "low");
    }

    if (reasons.length > 0) {
      risks.push({
        playerId: player.id,
        name: player.name,
        position: player.position,
        teamId: player.teamId,
        level: highestLevel(levels),
        starting,
        benchPosition: benchPosition(input.recommendation, player.id),
        reasons
      });
    }
  }

  for (const item of input.teamNewsReport?.items ?? []) {
    if (!item.selected || (item.severity !== "risk" && item.severity !== "avoid")) {
      continue;
    }

    const existing = risks.find((risk) => risk.playerId === item.playerId);
    const reason = `Team-news severity is ${item.severity}: ${item.summary}`;

    if (existing) {
      existing.reasons.push(reason);
      existing.level = highestLevel([existing.level, item.severity === "avoid" ? "high" : "medium"]);
      continue;
    }

    risks.push({
      playerId: item.playerId,
      name: item.webName,
      position: item.position,
      teamId: item.teamId,
      level: item.severity === "avoid" ? "high" : "medium",
      starting: startingIds.has(item.playerId),
      benchPosition: benchPosition(input.recommendation, item.playerId),
      reasons: [reason]
    });
  }

  for (const item of input.setPieceReport?.items ?? []) {
    if (!item.selected || item.status === "a") {
      continue;
    }

    const existing = risks.find((risk) => risk.playerId === item.playerId);
    const reason = `Set-piece role ${item.role} order ${item.order} has player status ${item.status}.`;

    if (existing) {
      existing.reasons.push(reason);
      existing.level = highestLevel([existing.level, "medium"]);
      continue;
    }

    risks.push({
      playerId: item.playerId,
      name: item.webName,
      position: item.position,
      teamId: item.teamId,
      level: "medium",
      starting: startingIds.has(item.playerId),
      benchPosition: benchPosition(input.recommendation, item.playerId),
      reasons: [reason]
    });
  }

  for (const item of input.minutesRiskReport?.items ?? []) {
    if (!item.selected || item.riskLevel === "secure") {
      continue;
    }

    const existing = risks.find((risk) => risk.playerId === item.playerId);
    const level: RiskLevel = item.riskLevel === "watch" ? item.starting ? "medium" : "low" : item.starting ? "high" : "medium";
    const reason = `Minutes risk is ${item.riskLevel}: ${item.summary}`;

    if (existing) {
      existing.reasons.push(reason);
      existing.level = highestLevel([existing.level, level]);
      continue;
    }

    risks.push({
      playerId: item.playerId,
      name: item.webName,
      position: item.position,
      teamId: item.teamId,
      level,
      starting: item.starting,
      benchPosition: item.benchPosition,
      reasons: [reason]
    });
  }

  return risks.sort((a, b) => levelScore(b.level) - levelScore(a.level) || a.playerId - b.playerId);
}

function buildStructureRisks(input: BuildSquadRiskReportInput) {
  const recommendation = input.recommendation;
  const risks: StructureRisk[] = [];
  const price = totalPrice(recommendation);
  const bank = recommendation.squadBefore.bank;
  const clubCounts = new Map<number, number>();
  const squadById = new Map(recommendation.squadBefore.players.map((player) => [player.id, player]));
  const captain = squadById.get(recommendation.captaincy.captainPlayerId);
  const outfieldBench = recommendation.pickTeam.benchOrder
    .map((playerId) => squadById.get(playerId))
    .filter((player) => player && player.position !== "GKP");
  const playableOutfieldBench = outfieldBench.filter((player) => (player?.minutes ?? 0) >= 1200);
  const firstOutfieldBench = outfieldBench[0];
  const difficultyByTeam = fixtureDifficultyByTeam(input.fixtureTicker, recommendation.gameweek);
  const oddsSignalByTeam = new Map(input.oddsReport?.teamSignals.map((team) => [team.teamId, team]) ?? []);
  const highDifficultyStarters = recommendation.pickTeam.startingXI
    .map((playerId) => squadById.get(playerId))
    .filter((player) => player && (difficultyByTeam.get(player.teamId) ?? 0) >= 4);
  const benchSpend = recommendation.pickTeam.benchOrder
    .map((playerId) => squadById.get(playerId))
    .filter((player): player is WeeklyRecommendation["squadBefore"]["players"][number] => Boolean(player))
    .reduce((sum, player) => sum + player.price, 0);
  const selectedTeamIds = new Set(recommendation.squadBefore.players.map((player) => player.teamId));
  const fixtureAttackTeams = (input.fixtureTicker?.teams ?? [])
    .map((team) => {
      const firstTwo = team.fixtures.slice(0, 2);
      const average = firstTwo.length > 0
        ? firstTwo.reduce((sum, fixture) => sum + fixture.difficulty, 0) / firstTwo.length
        : null;

      return {
        team,
        average
      };
    })
    .filter((item) => item.average !== null && item.average <= 2);
  const missingFixtureAttackTeams = fixtureAttackTeams.filter((item) => !selectedTeamIds.has(item.team.teamId));
  const selectedFixtureAttackTeams = fixtureAttackTeams.filter((item) => selectedTeamIds.has(item.team.teamId));
  const starterWatchOrWorse = input.minutesRiskReport?.summary.starterWatchOrWorse ?? 0;
  const selectedWatchOrWorse = input.minutesRiskReport?.summary.selectedWatchOrWorse ?? 0;

  if (price >= DEFAULT_STARTING_BUDGET || bank <= 0) {
    risks.push({
      risk: "budget-flexibility",
      level: "medium",
      message: `Squad uses £${price.toFixed(1)} with £${bank.toFixed(1)} bank, leaving no immediate upgrade buffer.`
    });
  }

  if (benchSpend > 17) {
    risks.push({
      risk: "bench-overfunding",
      level: "medium",
      message: `Bench spend is £${benchSpend.toFixed(1)}, which may be too much budget outside the XI.`
    });
  }

  if (firstOutfieldBench && (firstOutfieldBench.minutes ?? 0) < 1200) {
    risks.push({
      risk: "weak-first-bench",
      level: (firstOutfieldBench.minutes ?? 0) === 0 ? "high" : "medium",
      message: `First outfield bench player ${firstOutfieldBench.name} has limited historical minutes.`
    });
  } else if (playableOutfieldBench.length < 2) {
    risks.push({
      risk: "weak-bench-depth",
      level: "medium",
      message: "Fewer than two outfield bench players have strong historical minutes."
    });
  }

  for (const player of recommendation.squadBefore.players) {
    clubCounts.set(player.teamId, (clubCounts.get(player.teamId) ?? 0) + 1);
  }

  for (const [teamId, count] of clubCounts) {
    if (count === MAX_PLAYERS_PER_CLUB) {
      risks.push({
        risk: "max-club-exposure",
        level: "medium",
        message: `Team ${teamId} uses all ${MAX_PLAYERS_PER_CLUB} squad slots.`
      });
    }
  }

  if (captain && captain.price >= 14) {
    risks.push({
      risk: "captaincy-dependency",
      level: "medium",
      message: `Captain ${captain.name} costs £${captain.price.toFixed(1)}, so captaincy failure has a large structure cost.`
    });
  }

  if (highDifficultyStarters.length >= 3) {
    risks.push({
      risk: "fixture-cluster",
      level: "medium",
      message: `${highDifficultyStarters.length} starters have high immediate fixture difficulty.`
    });
  }

  if (fixtureAttackTeams.length > 0 && selectedFixtureAttackTeams.length === 0) {
    risks.push({
      risk: "fixture-upside-gap",
      level: "medium",
      message: `No squad exposure to the strongest first-two fixture blocks: ${fixtureAttackTeams.map((item) => item.team.teamName).join(", ")}.`
    });
  } else if (missingFixtureAttackTeams.length > 0) {
    risks.push({
      risk: "fixture-upside-gap",
      level: "low",
      message: `Some strong first-two fixture blocks are uncovered: ${missingFixtureAttackTeams.map((item) => item.team.teamName).join(", ")}.`
    });
  }

  if (starterWatchOrWorse > 5 || selectedWatchOrWorse > 7) {
    risks.push({
      risk: "minutes-risk-concentration",
      level: "medium",
      message: `${starterWatchOrWorse} starters and ${selectedWatchOrWorse} selected players are watch-or-worse in the minutes report.`
    });
  }

  if (input.oddsReport && input.oddsReport.summary.matchedFixtures === 0) {
    risks.push({
      risk: "odds-coverage",
      level: "medium",
      message: "Odds report exists, but no GW fixtures were matched to market rows."
    });
  }

  if (
    recommendation.confidence.score > 0.65 &&
    input.oddsReport?.summary.matchedFixtures === 0 &&
    input.minutesRiskReport?.items.some((item) => item.predictedLineupConfidence === "unavailable")
  ) {
    risks.push({
      risk: "false-precision",
      level: "medium",
      message: `Confidence ${recommendation.confidence.score.toFixed(2)} is high for a recommendation without matched odds or normalized predicted-lineup confidence.`
    });
  }

  if (captain) {
    const captainOdds = oddsSignalByTeam.get(captain.teamId);

    if (captainOdds?.attackSignal === "low" || captainOdds?.attackSignal === "unknown") {
      risks.push({
        risk: "captaincy-market",
        level: captainOdds.attackSignal === "unknown" ? "low" : "medium",
        message: `Captain ${captain.name} has ${captainOdds.attackSignal} odds-derived attack signal.`
      });
    }
  }

  if (recommendation.dataMode === "provisional" || input.dataStatus?.dataMode === "provisional") {
    risks.push({
      risk: "data-freshness",
      level: "high",
      message: "Recommendation uses provisional data."
    });
  }

  for (const position of positions) {
    const spend = recommendation.squadBefore.players
      .filter((player) => player.position === position)
      .reduce((sum, player) => sum + player.price, 0);

    risks.push({
      risk: `budget-${position.toLowerCase()}`,
      level: "low",
      message: `${position} spend is £${spend.toFixed(1)}.`
    });
  }

  return risks.sort((a, b) => levelScore(b.level) - levelScore(a.level) || a.risk.localeCompare(b.risk));
}

export function buildSquadRiskReport(input: BuildSquadRiskReportInput): SquadRiskReport {
  const playerRisks = buildPlayerRisks(input);
  const structureRisks = buildStructureRisks(input);
  const evidenceGaps = [
    input.teamNewsReport
      ? {
        area: "team-news",
        status: "reviewed" as const,
        message: "Automated team-news report is available."
      }
      : evidenceGap("team-news", input.contextNotes.teamNews, "Team-news context has not been reviewed."),
    input.setPieceReport
      ? {
        area: "set-pieces",
        status: "reviewed" as const,
        message: "Automated set-piece report is available."
      }
      : evidenceGap("set-pieces", input.contextNotes.setPieces, "Set-piece context has not been reviewed."),
    input.oddsReport
      ? {
        area: "odds",
        status: "reviewed" as const,
        message: "Automated odds report is available."
      }
      : {
        area: "odds",
        status: "missing" as const,
        message: "Automated odds report is missing."
      },
    input.minutesRiskReport
      ? {
        area: "minutes",
        status: "reviewed" as const,
        message: "Automated minutes risk report is available."
      }
      : {
        area: "minutes",
        status: "missing" as const,
        message: "Automated minutes risk report is missing."
      },
    input.publicEvidenceReport
      ? {
        area: "public-evidence",
        status: "reviewed" as const,
        message: "Public browser evidence report is available."
      }
      : {
        area: "public-evidence",
        status: "missing" as const,
        message: "Public browser evidence report is missing."
      },
    input.publicEvidenceReport
      ? {
        area: "watchlist",
        status: "reviewed" as const,
        message: "Manual watchlist is optional because public evidence report is available."
      }
      : evidenceGap("watchlist", input.contextNotes.watchlist, "Watchlist context has not been reviewed.")
  ];
  const allLevels = [
    ...playerRisks.map((risk) => risk.level),
    ...structureRisks.map((risk) => risk.level)
  ];
  const notes = [
    "Risk report is evidence-only and does not choose alternatives.",
    `${playerRisks.length} player risks, ${structureRisks.length} structure risks, ${evidenceGaps.filter((gap) => gap.status === "missing").length} evidence gaps.`
  ];

  return {
    generatedAt: input.generatedAt,
    gameweek: input.recommendation.gameweek,
    dataMode: input.dataStatus?.dataMode ?? input.recommendation.dataMode,
    summary: {
      high: allLevels.filter((level) => level === "high").length,
      medium: allLevels.filter((level) => level === "medium").length,
      low: allLevels.filter((level) => level === "low").length,
      evidenceGaps: evidenceGaps.filter((gap) => gap.status === "missing").length
    },
    playerRisks,
    structureRisks,
    evidenceGaps,
    notes
  };
}

export function renderSquadRiskReportMarkdown(report: SquadRiskReport) {
  return `# Squad Risk Report: GW${report.gameweek}

Generated: ${report.generatedAt}

Data mode: ${report.dataMode}

## Summary

- High risks: ${report.summary.high}
- Medium risks: ${report.summary.medium}
- Low risks: ${report.summary.low}
- Evidence gaps: ${report.summary.evidenceGaps}

## Player Risks

${report.playerRisks.map((risk) => `- ${risk.name} (${risk.position}): ${risk.level} - ${risk.reasons.join(" ")}`).join("\n") || "- None"}

## Structure Risks

${report.structureRisks.map((risk) => `- ${risk.risk}: ${risk.level} - ${risk.message}`).join("\n") || "- None"}

## Evidence Gaps

${report.evidenceGaps.map((gap) => `- ${gap.area}: ${gap.status} - ${gap.message}`).join("\n")}

## Notes

${report.notes.map((note) => `- ${note}`).join("\n")}
`;
}
