import selectionJson from "../data/cache/gw1-final-2026-08-21/selection.json";

type DecisionInput = {
  selectionCase: string;
  alternativePlayerId: number;
  alternativeCase: string;
  materialRisk: string;
  riskResponse: string;
  evidenceIds: string[];
  trigger?: { metric: "startProbability"; operator: "lt"; threshold: number; action: "REOPTIMIZE" };
};

const selection = selectionJson as typeof selectionJson & {
  squad: typeof selectionJson.squad & { formation: "3-4-3" };
};

export const CURRENT_SQUAD = {
  bank: selection.squad.bank,
  freeTransfers: 1,
  chipsAvailable: ["wildcard", "free_hit", "bench_boost", "triple_captain"],
  players: [...selection.squad.playerIds],
  captainPlayerId: selection.squad.captainPlayerId,
  viceCaptainPlayerId: selection.squad.viceCaptainPlayerId,
  benchOrder: [...selection.squad.benchOrder],
  formation: selection.squad.formation
};

export const SQUAD_STRATEGY = {
  objective: {
    type: "MULTI_GAMEWEEK_EXPECTED_POINTS",
    horizon: 3,
    weights: [1, 0.85, 0.7],
    expectedTransferPolicy: "STATIC_SQUAD_NO_TRANSFER_OPTIONALITY"
  },
  constraints: {
    budget: 100,
    benchBudgetMax: selection.eligibility.maximumBenchCost,
    minimumXIStartProbability: selection.eligibility.minimumStartProbability,
    minimumBenchStartProbability: selection.eligibility.minimumStartProbability,
    maximumPlayersPerClub: 3,
    simulationMode: "CORRELATED_MATCH_LEVEL"
  },
  decisionTolerance: {
    minimumExpectedPointsDelta: 0.15,
    modelUncertaintyThreshold: 0.15,
    tieBreakOrder: ["higher_p10", "higher_start_probability", "lower_price", "lower_club_concentration", "optimizer_candidate_order"]
  },
  optimizerRun: {
    runId: selection.selectedCandidateId,
    generatedAt: selection.generatedAt,
    sourcePath: "data/cache/gw1-final-2026-08-21/selection.json",
    model: selection.simulation.model,
    modelVersion: selection.simulation.modelVersion,
    sampleCount: selection.simulation.sampleCount
  }
} as const;

export const PLAYER_DECISION_INPUTS: Record<number, DecisionInput> = {
  82: {
    selectionCase: "Best goalkeeper fit in the selected three-gameweek structure.",
    alternativePlayerId: 529,
    alternativeCase: "The alternative has a weaker current role-adjusted projection.",
    materialRisk: "Brentford face Tottenham in GW1, limiting immediate clean-sheet potential.",
    riskResponse: "The selection is based on the multi-gameweek objective rather than a one-match clean-sheet bet.",
    evidenceIds: ["projection", "fixtures", "optimizer"]
  },
  109: {
    selectionCase: "Starting goalkeeper cover at the minimum selected backup price.",
    alternativePlayerId: 57,
    alternativeCase: "The alternative does not improve the reserve role under the bench constraint.",
    materialRisk: "The backup goalkeeper normally scores only if the starter misses the match.",
    riskResponse: "No additional budget is committed to a low-usage substitute slot.",
    evidenceIds: ["projection", "optimizer"]
  },
  4: {
    selectionCase: "Premium defender with the strongest role-adjusted projection among the selected defenders.",
    alternativePlayerId: 201,
    alternativeCase: "The cheaper alternative gives up current projection and opening-fixture upside.",
    materialRisk: "The premium price consumes budget and creates double Arsenal defence.",
    riskResponse: "The projection edge is retained after applying the concentration-aware model.",
    evidenceIds: ["projection", "fixtures", "optimizer"]
  },
  8: {
    selectionCase: "Lower-cost access to Arsenal defence while clearing the strategy's starter threshold.",
    alternativePlayerId: 201,
    alternativeCase: "The alternative improves diversification but trails the selected opening structure.",
    materialRisk: "Start security is at the minimum accepted level and an early substitution is possible.",
    riskResponse: "A threshold breach triggers reoptimization, with the first outfield substitute providing immediate cover.",
    evidenceIds: ["projection", "minutes", "lineups"],
    trigger: { metric: "startProbability", operator: "lt", threshold: 0.78, action: "REOPTIMIZE" }
  },
  533: {
    selectionCase: "Secure projected starter retained in the selected defensive structure.",
    alternativePlayerId: 534,
    alternativeCase: "The alternative adds role interpretation risk without improving the current projection.",
    materialRisk: "Sunderland defensive roles may change when the full back line is available.",
    riskResponse: "The current role forecast clears the selection threshold and the bench covers a late omission.",
    evidenceIds: ["projection", "lineups", "optimizer"]
  },
  32: {
    selectionCase: "Strongest first-outfield-substitute fit under the bench budget constraint.",
    alternativePlayerId: 257,
    alternativeCase: "The alternative is model-equivalent and offers no meaningful downside improvement.",
    materialRisk: "A bench defender has limited expected use in a fully available XI.",
    riskResponse: "First-substitute placement covers the starting defender with the lowest role security.",
    evidenceIds: ["projection", "optimizer"]
  },
  204: {
    selectionCase: "Starting defender cover at the selected reserve price without weakening the XI.",
    alternativePlayerId: 257,
    alternativeCase: "The alternatives are a model tie, so the optimizer's deterministic tie-break is retained.",
    materialRisk: "The player shares a club with another substitute.",
    riskResponse: "Both correlated players are substitutes and the selection stays within the club limit.",
    evidenceIds: ["projection", "optimizer"]
  },
  428: {
    selectionCase: "Strong role-adjusted projection at an upper-midfield price.",
    alternativePlayerId: 427,
    alternativeCase: "The alternative trails the current role-adjusted projection.",
    materialRisk: "A minor preseason knock creates some availability uncertainty.",
    riskResponse: "Current appearance and role forecasts remain above the strategy threshold.",
    evidenceIds: ["projection", "lineups"]
  },
  397: {
    selectionCase: "Improves the selected midfield's projection and multi-gameweek structure.",
    alternativePlayerId: 13,
    alternativeCase: "The alternative is cheaper but weaker in the optimizer-selected structure.",
    materialRisk: "Pairing with the captain creates shared Manchester City attacking downside.",
    riskResponse: "Correlation is modelled explicitly and the optimizer still retains the double-up.",
    evidenceIds: ["projection", "fixtures", "optimizer"]
  },
  260: {
    selectionCase: "Highest role-adjusted projection in the relevant sub-premium midfield comparison.",
    alternativePlayerId: 236,
    alternativeCase: "The alternative diversifies clubs but has a weaker current projection.",
    materialRisk: "The player is part of a three-player Leeds attack.",
    riskResponse: "The correlated model is allowed to retain concentration when the objective still wins.",
    evidenceIds: ["projection", "optimizer"]
  },
  336: {
    selectionCase: "Best current projection in the selected price slot while clearing the starter threshold.",
    alternativePlayerId: 236,
    alternativeCase: "The alternative requires a broader structure change and does not improve the current objective.",
    materialRisk: "Start security is at the minimum accepted level and increases Leeds concentration.",
    riskResponse: "A threshold breach triggers reoptimization, with the first substitute providing coverage.",
    evidenceIds: ["projection", "minutes", "fixtures", "optimizer"],
    trigger: { metric: "startProbability", operator: "lt", threshold: 0.78, action: "REOPTIMIZE" }
  },
  212: {
    selectionCase: "Fills the fifth midfield slot at the minimum selected price while clearing the reserve threshold.",
    alternativePlayerId: 270,
    alternativeCase: "The alternative has materially weaker role security and projection.",
    materialRisk: "Starting security is not strong enough for the XI and another substitute shares the club.",
    riskResponse: "Third-substitute placement limits exposure while preserving legal emergency cover.",
    evidenceIds: ["projection", "minutes", "optimizer"]
  },
  411: {
    selectionCase: "Highest projected player in the squad and strongest captaincy option.",
    alternativePlayerId: 426,
    alternativeCase: "The alternative belongs to a different premium structure that loses the selected multi-gameweek objective.",
    materialRisk: "The premium price forces value selections elsewhere and attacking returns are shared with a teammate.",
    riskResponse: "Both the horizon objective and correlated simulation retain the premium structure.",
    evidenceIds: ["projection", "fixtures", "optimizer"]
  },
  165: {
    selectionCase: "Strong projection and the highest start security among the selected attackers.",
    alternativePlayerId: 106,
    alternativeCase: "The alternative costs more and has weaker current projection and start security.",
    materialRisk: "Attacking competition remains and the opening fixture is away.",
    riskResponse: "The current role forecast makes the player the safest vice-captain fallback.",
    evidenceIds: ["projection", "lineups", "fixtures"]
  },
  346: {
    selectionCase: "Selected forward at the price point with stronger role security than the named alternative.",
    alternativePlayerId: 463,
    alternativeCase: "The current reproducible GW1 projection edge is outside tolerance; the previous unsourced correlated-squad delta is not retained.",
    materialRisk: "The player completes a three-player Leeds attacking stack.",
    riskResponse: "The decision is classified from current structured values and must be re-evaluated if a reproducible squad-level counterfactual disagrees.",
    evidenceIds: ["projection", "optimizer"]
  }
};
