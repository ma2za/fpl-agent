import { DEFAULT_STARTING_BUDGET, REQUIRED_SQUAD_COUNTS, type DeadlineStatus } from "../../rules/src";
import type {
  BudgetTier,
  DecisionContext,
  EvidencePack,
  EvidencePlayer
} from "./types";
import type { PlayerForEngine, PlayerProjection } from "../../engine/src";

type BuildEvidencePackInput = {
  gameweek: number;
  createdAt: string;
  dataMode: "official" | "provisional";
  deadline: string;
  deadlineStatus: DeadlineStatus;
  manualSquadConfigured: boolean;
  currentSquadPlayerIds: number[];
  riskProfile: Record<string, string>;
  notes: DecisionContext["notes"];
  warnings: string[];
  players: PlayerForEngine[];
  projections: PlayerProjection[];
  freeTransfers: number;
  chipsAvailable: string[];
};

const positions = ["GKP", "DEF", "MID", "FWD"] as const;

function teamName(player: EvidencePlayer) {
  return (player as EvidencePlayer & { team?: string }).team ?? `Team ${player.teamId}`;
}

function withProjections(players: PlayerForEngine[], projections: PlayerProjection[]) {
  const projectionById = new Map(projections.map((projection) => [projection.playerId, projection.projectedPoints]));

  return players.map((player) => ({
    ...player,
    projectedPoints: projectionById.get(player.id) ?? 0
  }));
}

function topByPosition(players: EvidencePlayer[], position: string) {
  return players
    .filter((player) => player.position === position)
    .sort(
      (a, b) =>
        b.projectedPoints - a.projectedPoints ||
        (b.expectedPointsNext ?? 0) - (a.expectedPointsNext ?? 0) ||
        (b.totalPoints ?? 0) - (a.totalPoints ?? 0) ||
        a.price - b.price ||
        a.id - b.id
    )
    .slice(0, 30);
}

function buildBudgetTiers(players: EvidencePlayer[]): BudgetTier[] {
  const tiers = [
    { name: "premium", minPrice: 10, maxPrice: 15 },
    { name: "upper-mid", minPrice: 7.5, maxPrice: 9.9 },
    { name: "mid-price", minPrice: 5.5, maxPrice: 7.4 },
    { name: "budget", minPrice: 0, maxPrice: 5.4 }
  ];

  return tiers.map((tier) => ({
    ...tier,
    players: players
      .filter((player) => player.price >= tier.minPrice && player.price <= tier.maxPrice)
      .sort((a, b) => b.projectedPoints - a.projectedPoints || (b.totalPoints ?? 0) - (a.totalPoints ?? 0))
      .slice(0, 30)
  }));
}

function buildClubExposure(players: EvidencePlayer[]) {
  const byTeam = new Map<number, EvidencePlayer[]>();

  for (const player of players) {
    byTeam.set(player.teamId, [...(byTeam.get(player.teamId) ?? []), player]);
  }

  return [...byTeam.entries()]
    .map(([teamId, teamPlayers]) => ({
      teamId,
      teamName: teamName(teamPlayers[0]),
      count: teamPlayers.length,
      totalPrice: Number(teamPlayers.reduce((sum, player) => sum + player.price, 0).toFixed(1)),
      players: teamPlayers
        .sort((a, b) => b.projectedPoints - a.projectedPoints || (b.totalPoints ?? 0) - (a.totalPoints ?? 0))
        .slice(0, 10)
    }))
    .sort((a, b) => b.players[0].projectedPoints - a.players[0].projectedPoints || a.teamId - b.teamId);
}

export function buildEvidencePack(input: BuildEvidencePackInput): EvidencePack {
  const playersWithProjections = withProjections(input.players, input.projections);
  const context: DecisionContext = {
    gameweek: input.gameweek,
    createdAt: input.createdAt,
    dataMode: input.dataMode,
    deadline: input.deadline,
    deadlineStatus: input.deadlineStatus,
    manualSquadConfigured: input.manualSquadConfigured,
    currentSquadPlayerIds: input.currentSquadPlayerIds,
    riskProfile: input.riskProfile,
    notes: input.notes,
    warnings: input.warnings
  };
  const recommendationTemplate = {
    status: "agent_decision_required",
    gameweek: input.gameweek,
    createdAt: null,
    deadline: input.deadline,
    deadlineStatus: input.deadlineStatus,
    dataMode: input.dataMode,
    squadBefore: {
      players: [],
      bank: null,
      freeTransfers: input.freeTransfers,
      chipsAvailable: input.chipsAvailable
    },
    recommendedAction: null,
    pickTeam: null,
    captaincy: null,
    chip: null,
    confidence: null,
    risks: [],
    whatWouldChangeMyMind: [],
    manualExecutionRequired: true
  };

  return {
    context,
    projections: input.projections,
    playerPool: {
      GKP: topByPosition(playersWithProjections, "GKP"),
      DEF: topByPosition(playersWithProjections, "DEF"),
      MID: topByPosition(playersWithProjections, "MID"),
      FWD: topByPosition(playersWithProjections, "FWD")
    },
    budgetTiers: buildBudgetTiers(playersWithProjections),
    clubExposure: buildClubExposure(playersWithProjections),
    recommendationTemplate
  };
}

export function renderProjectionSummary(evidencePack: EvidencePack) {
  const lines = positions.flatMap((position) => {
    const players = evidencePack.playerPool[position].slice(0, 8);

    return [
      `## ${position}`,
      "",
      ...players.map(
        (player) =>
          `- ${player.name} (${teamName(player)}, £${player.price.toFixed(1)}): ${player.projectedPoints.toFixed(1)} projected, ${player.totalPoints ?? 0} total points`
      ),
      ""
    ];
  });

  return `# Projection Summary: GW${evidencePack.context.gameweek}

Data mode: ${evidencePack.context.dataMode}

Deadline status: ${evidencePack.context.deadlineStatus}

${lines.join("\n")}
`;
}

export function renderDecisionPrompts(evidencePack: EvidencePack) {
  return `# Decision Prompts: GW${evidencePack.context.gameweek}

## Current Context

- Data mode: ${evidencePack.context.dataMode}
- Deadline: ${evidencePack.context.deadline}
- Manual squad configured: ${evidencePack.context.manualSquadConfigured}
- Budget: £${DEFAULT_STARTING_BUDGET.toFixed(1)}
- Squad structure: ${REQUIRED_SQUAD_COUNTS.GKP} GKP, ${REQUIRED_SQUAD_COUNTS.DEF} DEF, ${REQUIRED_SQUAD_COUNTS.MID} MID, ${REQUIRED_SQUAD_COUNTS.FWD} FWD

## Agent Questions

- Which premium captain structure is best for the current fixtures?
- Which cheap players are real starters rather than projection artifacts?
- Which clubs are worth double or triple exposure?
- Which picks depend on set pieces or penalties?
- Which players should be avoided because of minutes, injury, transfer, or rotation risk?
- What would change the recommendation before deadline?

## Manual Context To Read

- packages/content/context/fixtures.md
- packages/content/context/team-news.md
- packages/content/context/set-pieces.md
- packages/content/context/watchlist.md
- packages/content/context/strategy.md
`;
}
