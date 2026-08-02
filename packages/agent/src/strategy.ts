import type {
  EvidencePack,
  FixtureHorizonReport,
  QualityGateResult,
  SeasonStrategy,
  StrategyEvidence,
  StrategyQualityReport,
  WeeklyRecommendation,
  WeeklyStrategy
} from "./types";

type BuildStrategyEvidenceInput = {
  evidencePack: EvidencePack;
  seasonPlanExists: boolean;
  weeklyStrategyExists: boolean;
  fixtureHorizonReport?: FixtureHorizonReport | null;
};

type EvaluateWeeklyStrategyQualityInput = {
  weeklyStrategy: WeeklyStrategy | null;
  recommendation: WeeklyRecommendation;
  seasonPlanText: string | null;
  riskProfile: Record<string, string>;
};

const defaultSeasonStrategy: SeasonStrategy = {
  status: "agent_authored",
  riskProfile: "balanced",
  squadSource: "from_scratch",
  agentRole: "agent_decides",
  windows: [
    { gameweeks: "GW1-6", focus: "Opening structure and information gathering." },
    { gameweeks: "GW7-12", focus: "First fixture-swing adjustment window." },
    { gameweeks: "GW13-20", focus: "Winter congestion flexibility." },
    { gameweeks: "GW21-30", focus: "Chip and doubles/blanks preparation." },
    { gameweeks: "GW31-38", focus: "Run-in aggression and chip execution." }
  ],
  chipPosture: "Conservative early. Save chips until fixture doubles, blanks, or exceptional captaincy edges are visible.",
  transferDiscipline: "Balanced. Prefer rolling when structure is sound; take hits only for clear multi-week gains or unavailable players.",
  captaincyPolicy: "Prioritize reliable premium attackers with strong fixture, minutes, and role security.",
  squadBuildingPrinciples: [
    "Start with a legal, flexible squad structure.",
    "Keep captaincy routes open across fixture swings.",
    "Avoid weak benches that force early transfers.",
    "Treat current team news as mandatory before deadline."
  ]
};

function hasText(value: string | undefined | null) {
  return typeof value === "string" && value.trim().length > 0;
}

function addGate(gates: QualityGateResult[], gate: string, status: QualityGateResult["status"], message: string) {
  gates.push({ gate, status, message });
}

function topNames(evidencePack: EvidencePack, count: number) {
  return Object.values(evidencePack.playerPool)
    .flat()
    .sort((a, b) => b.projectedPoints - a.projectedPoints || a.price - b.price)
    .slice(0, count)
    .map((player) => `${player.name} (£${player.price.toFixed(1)}, ${player.projectedPoints.toFixed(1)} projected)`);
}

export function buildStrategyEvidence(input: BuildStrategyEvidenceInput): StrategyEvidence {
  const context = input.evidencePack.context;
  const horizonLines = (gameweeks: 1 | 3 | 6) => {
    const teams = input.fixtureHorizonReport?.teams.map((team) => {
      const horizon = team.horizons.find((item) => item.gameweeks === gameweeks);
      return horizon ? `${team.teamName}: attack ${horizon.attack.label} ${horizon.attack.averageDifficulty ?? "n/a"}, defence ${horizon.defence.label} ${horizon.defence.averageDifficulty ?? "n/a"}, coverage ${horizon.attack.coverage}/${horizon.defence.coverage}.` : null;
    }).filter((line): line is string => Boolean(line)) ?? [];

    return teams.length > 0 ? teams : ["Fixture horizon report is unavailable; use the legacy fixture ticker."];
  };

  return {
    gameweek: context.gameweek,
    createdAt: context.createdAt,
    dataMode: context.dataMode,
    deadline: context.deadline,
    deadlineStatus: context.deadlineStatus,
    riskProfile: context.riskProfile,
    seasonPlanExists: input.seasonPlanExists,
    weeklyStrategyExists: input.weeklyStrategyExists,
    horizonSummary: {
      oneGameweek: [
        "Use for captaincy, vice-captaincy, starting XI, and bench order.",
        ...topNames(input.evidencePack, 5),
        ...horizonLines(1)
      ],
      threeGameweeks: [
        "Use for free transfers, short-term fixture attacks, and avoiding immediate reversals.",
        ...horizonLines(3)
      ],
      sixGameweeks: [
        "Use for squad structure, premium distribution, club exposure, and fixture-swing planning.",
        ...horizonLines(6)
      ]
    },
    prompts: [
      "Does the weekly plan follow the season chip posture?",
      "Does the transfer posture match the configured risk profile?",
      "Which players are only attractive for one week and should be avoided in the initial structure?",
      "Which fixture swing would change the next planned move?",
      "What new team news would invalidate the captaincy or bench plan?"
    ],
    warnings: context.warnings
  };
}

export function renderSeasonStrategyTemplate() {
  return `# Season Strategy

Status: agent_authored

## Defaults

- Risk profile: ${defaultSeasonStrategy.riskProfile}
- Squad source: from-scratch GW1 squad until a real squad is configured
- Agent role: Codex authors decisions; scripts prepare evidence and checks

## Season Windows

${defaultSeasonStrategy.windows.map((window) => `- ${window.gameweeks}: ${window.focus}`).join("\n")}

## Chip Posture

${defaultSeasonStrategy.chipPosture}

## Transfer Discipline

${defaultSeasonStrategy.transferDiscipline}

## Captaincy Policy

${defaultSeasonStrategy.captaincyPolicy}

## Squad-Building Principles

${defaultSeasonStrategy.squadBuildingPrinciples.map((principle) => `- ${principle}`).join("\n")}
`;
}

export function renderWeeklyStrategyTemplate(input: StrategyEvidence) {
  return `# Weekly Strategy: GW${input.gameweek}

Status: agent_decision_required

## Weekly Thesis

Write the agent-authored thesis here after reading the evidence pack, current FPL data, fixtures, team news, and strategy notes.

## Horizons

- 1GW: captaincy, vice-captaincy, starting XI, and bench order.
- 3GW: transfers and short-term fixture attacks.
- 6GW: squad structure, premium distribution, and fixture swings.

## Transfer Plan

State whether this week is a roll, free transfer, hit, wildcard, or free hit week, and why that matches the balanced risk profile.

## Captaincy Plan

State the captaincy profile and why it matches the weekly thesis.

## Chip Plan

State the chip decision and how it follows the season chip posture.

## Risks

- Add current risks.

## What Would Change My Mind

- Add deadline change conditions.
`;
}

export function weeklyStrategyJsonTemplate(gameweek: number): WeeklyStrategy {
  return {
    gameweek,
    status: "agent_decision_required",
    riskProfile: "balanced",
    squadSource: "from_scratch",
    weeklyThesis: "",
    horizons: {
      oneGameweek: "",
      threeGameweeks: "",
      sixGameweeks: ""
    },
    transferPlan: {
      posture: "roll",
      rationale: "",
      followsRiskProfile: true
    },
    captaincyPlan: {
      primaryProfile: "",
      rationale: ""
    },
    chipPlan: {
      chip: "none",
      rationale: "",
      referencesSeasonPosture: false
    },
    risks: [],
    whatWouldChangeMyMind: []
  };
}

function transferPostureMatchesRecommendation(strategy: WeeklyStrategy, recommendation: WeeklyRecommendation) {
  if (recommendation.recommendedAction.type === "hit") {
    return strategy.transferPlan.posture === "hit";
  }

  if (recommendation.recommendedAction.type === "wildcard") {
    return strategy.transferPlan.posture === "wildcard";
  }

  if (recommendation.recommendedAction.type === "free_hit") {
    return strategy.transferPlan.posture === "free_hit";
  }

  if (recommendation.recommendedAction.transfers.length > 0) {
    return strategy.transferPlan.posture === "free_transfer";
  }

  if (["retain_draft", "wait_for_information", "lock_draft"].includes(recommendation.recommendedAction.type)) {
    return strategy.transferPlan.posture === "roll";
  }

  if (["modify_draft", "rebuild_structure"].includes(recommendation.recommendedAction.type)) {
    return strategy.transferPlan.posture === "free_transfer";
  }

  return strategy.transferPlan.posture === "roll";
}

export function evaluateWeeklyStrategyQuality(input: EvaluateWeeklyStrategyQualityInput): StrategyQualityReport {
  const gates: QualityGateResult[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const riskProfile = input.riskProfile.transferHits === "conservative" ? "conservative" : "balanced";

  if (!input.weeklyStrategy) {
    addGate(gates, "weekly-strategy", "fail", "Weekly strategy file is required.");
  } else {
    const strategy = input.weeklyStrategy;

    if (strategy.status !== "agent_authored") {
      addGate(gates, "weekly-strategy", "fail", "Weekly strategy must be agent_authored.");
    } else {
      addGate(gates, "weekly-strategy", "pass", "Weekly strategy is agent-authored.");
    }

    if (!hasText(strategy.weeklyThesis)) {
      addGate(gates, "weekly-thesis", "fail", "Weekly strategy thesis is required.");
    } else {
      addGate(gates, "weekly-thesis", "pass", "Weekly strategy thesis is present.");
    }

    if (!hasText(strategy.captaincyPlan.rationale)) {
      addGate(gates, "strategy-captaincy", "fail", "Weekly strategy captaincy rationale is required.");
    } else if (!hasText(input.recommendation.captaincy.explanation)) {
      addGate(gates, "strategy-captaincy", "fail", "Recommendation captaincy rationale is required for strategy alignment.");
    } else {
      addGate(gates, "strategy-captaincy", "pass", "Captaincy rationale is present in strategy and recommendation.");
    }

    if (!hasText(strategy.chipPlan.rationale) || !strategy.chipPlan.referencesSeasonPosture) {
      addGate(gates, "strategy-chip", "fail", "Weekly strategy chip plan must reference the season chip posture.");
    } else if (strategy.chipPlan.chip !== input.recommendation.chip.chip) {
      addGate(gates, "strategy-chip", "warn", "Weekly strategy chip differs from recommendation chip.");
    } else {
      addGate(gates, "strategy-chip", "pass", "Chip plan references season posture and matches recommendation.");
    }

    if (!hasText(strategy.transferPlan.rationale)) {
      addGate(gates, "strategy-transfers", "fail", "Weekly strategy transfer rationale is required.");
    } else if (!transferPostureMatchesRecommendation(strategy, input.recommendation)) {
      addGate(gates, "strategy-transfers", "warn", "Weekly strategy transfer posture differs from recommendation action.");
    } else if (riskProfile === "conservative" && input.recommendation.recommendedAction.transferCost > 0) {
      addGate(gates, "strategy-transfers", "warn", "Transfer hit contradicts conservative risk profile.");
    } else if (!strategy.transferPlan.followsRiskProfile) {
      addGate(gates, "strategy-transfers", "warn", "Weekly strategy says transfer plan does not follow risk profile.");
    } else {
      addGate(gates, "strategy-transfers", "pass", "Transfer plan follows configured risk profile.");
    }

    if (strategy.risks.length === 0) {
      addGate(gates, "strategy-risks", "fail", "Weekly strategy risks are required.");
    } else {
      addGate(gates, "strategy-risks", "pass", "Weekly strategy risks are present.");
    }

    if (strategy.whatWouldChangeMyMind.length === 0) {
      addGate(gates, "strategy-change-conditions", "fail", "Weekly strategy change conditions are required.");
    } else {
      addGate(gates, "strategy-change-conditions", "pass", "Weekly strategy change conditions are present.");
    }
  }

  if (!hasText(input.seasonPlanText)) {
    addGate(gates, "season-strategy", "fail", "Season strategy file is required.");
  } else {
    addGate(gates, "season-strategy", "pass", "Season strategy file is present.");
  }

  for (const gate of gates) {
    if (gate.status === "fail") {
      errors.push(gate.message);
    }

    if (gate.status === "warn") {
      warnings.push(gate.message);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    gates
  };
}
