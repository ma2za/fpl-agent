import { describe, expect, it } from "vitest";
import {
  buildSquadRiskReport,
  renderSquadRiskReportMarkdown,
  type FixtureTicker,
  type MinutesRiskReport,
  type OddsReport,
  type PublicEvidenceReport,
  type SetPieceReport,
  type TeamNewsReport,
  type WeeklyRecommendation
} from "../src";

const recommendation: WeeklyRecommendation = {
  gameweek: 1,
  createdAt: "2026-07-04T00:00:00.000Z",
  deadline: "2026-08-15T10:00:00Z",
  deadlineStatus: "open",
  dataMode: "official",
  squadBefore: {
    bank: 1,
    freeTransfers: 1,
    chipsAvailable: ["wildcard", "free_hit", "bench_boost", "triple_captain"],
    players: [
      { id: 1, name: "Goalkeeper 1", position: "GKP", teamId: 1, price: 4.5, nowCost: 45, status: "a", minutes: 3000 },
      { id: 2, name: "Goalkeeper 2", position: "GKP", teamId: 2, price: 4, nowCost: 40, status: "a", minutes: 3000 },
      { id: 3, name: "Defender 1", position: "DEF", teamId: 1, price: 5, nowCost: 50, status: "a", minutes: 3000 },
      { id: 4, name: "Defender 2", position: "DEF", teamId: 2, price: 5, nowCost: 50, status: "a", minutes: 3000 },
      { id: 5, name: "Defender 3", position: "DEF", teamId: 3, price: 4.5, nowCost: 45, status: "a", minutes: 3000 },
      { id: 6, name: "Defender 4", position: "DEF", teamId: 4, price: 4.5, nowCost: 45, status: "a", minutes: 3000 },
      { id: 7, name: "Defender 5", position: "DEF", teamId: 5, price: 4, nowCost: 40, status: "a", minutes: 3000 },
      { id: 8, name: "Midfielder 1", position: "MID", teamId: 3, price: 8, nowCost: 80, status: "a", minutes: 3000 },
      { id: 9, name: "Midfielder 2", position: "MID", teamId: 4, price: 8, nowCost: 80, status: "a", minutes: 3000 },
      { id: 10, name: "Midfielder 3", position: "MID", teamId: 5, price: 7, nowCost: 70, status: "a", minutes: 3000 },
      { id: 11, name: "Midfielder 4", position: "MID", teamId: 6, price: 6.5, nowCost: 65, status: "a", minutes: 3000 },
      { id: 12, name: "Midfielder 5", position: "MID", teamId: 7, price: 5.5, nowCost: 55, status: "a", minutes: 3000 },
      { id: 13, name: "Forward 1", position: "FWD", teamId: 6, price: 8, nowCost: 80, status: "a", minutes: 3000 },
      { id: 14, name: "Forward 2", position: "FWD", teamId: 7, price: 7, nowCost: 70, status: "a", minutes: 3000 },
      { id: 15, name: "Forward 3", position: "FWD", teamId: 8, price: 6.5, nowCost: 65, status: "a", minutes: 3000 }
    ]
  },
  recommendedAction: {
    type: "roll",
    transfers: [],
    transferCost: 0,
    bankAfter: 1,
    explanation: "Roll."
  },
  pickTeam: {
    formation: "3-4-3",
    startingXI: [1, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15],
    benchOrder: [2, 6, 12, 7],
    projectedPoints: 60,
    explanation: "Pick."
  },
  captaincy: {
    captainPlayerId: 8,
    viceCaptainPlayerId: 13,
    alternatives: [],
    explanation: "Captaincy."
  },
  chip: {
    chip: "none",
    confidence: "high",
    expectedGain: 0,
    reasons: ["No chip."],
    warnings: []
  },
  topTransferCandidates: [],
  confidence: {
    score: 0.5,
    label: "medium",
    explanation: "Confidence."
  },
  evidenceReferences: [
    { area: "squad", source: "test", reportPath: "test.md", note: "Squad evidence." },
    { area: "starting-xi", source: "test", reportPath: "test.md", note: "XI evidence." },
    { area: "shortlist", source: "test", reportPath: "test.md", note: "Shortlist evidence." },
    { area: "captaincy", source: "test", reportPath: "test.md", note: "Captaincy evidence." },
    { area: "bench", source: "test", reportPath: "test.md", note: "Bench evidence." },
    { area: "chip", source: "test", reportPath: "test.md", note: "Chip evidence." },
    { area: "risks", source: "test", reportPath: "test.md", note: "Risk evidence." },
    { area: "change-conditions", source: "test", reportPath: "test.md", note: "Change evidence." }
  ],
  risks: ["Risk."],
  whatWouldChangeMyMind: ["Condition."],
  legality: {
    isValid: true,
    errors: [],
    warnings: []
  },
  manualExecutionRequired: true
};

const reviewedContext = {
  teamNews: "Reviewed: yes",
  setPieces: "Reviewed: yes",
  watchlist: "Reviewed: yes"
};

const oddsReport: OddsReport = {
  generatedAt: "2026-07-04T00:00:00.000Z",
  gameweek: 1,
  source: {
    id: "odds",
    label: "Football-Data fixture odds",
    provider: "Football-Data",
    url: null,
    rawPath: null,
    reportPath: null,
    required: true,
    confidence: "medium",
    freshness: {
      status: "fresh",
      checkedAt: "2026-07-04T00:00:00.000Z",
      fetchedAt: "2026-07-04T00:00:00.000Z",
      ageHours: 0,
      maxAgeHours: 12,
      message: "Fresh."
    }
  },
  summary: {
    sourceRows: 1,
    premierLeagueRows: 1,
    gameweekFixtures: 1,
    matchedFixtures: 1,
    unmatchedFixtures: 0,
    selectedTeamsCovered: 1,
    coverageStatus: "partial",
    marketCoverage: {
      matchOdds: "covered",
      overUnder: "covered",
      cleanSheet: "missing",
      anytimeScorer: "missing",
      teamGoals: "missing"
    }
  },
  matches: [],
  teamSignals: [
    {
      teamId: 3,
      teamName: "Team 3",
      fixtureId: 1,
      event: 1,
      opponentTeamId: 99,
      opponentName: "Opponent",
      venue: "H",
      winProbability: 0.6,
      drawProbability: 0.25,
      lossProbability: 0.15,
      over25Probability: 0.55,
      under25Probability: 0.45,
      cleanSheetProbability: null,
      teamGoalsExpected: null,
      attackSignal: "high",
      cleanSheetSignal: "high",
      attackSignalSource: "derived",
      cleanSheetSignalSource: "derived",
      selectedPlayerIds: [8],
      summary: "Team 3 market signal."
    }
  ],
  playerSignals: [],
  warnings: []
};

const minutesRiskReport: MinutesRiskReport = {
  generatedAt: "2026-07-04T00:00:00.000Z",
  gameweek: 1,
  source: {
    id: "minutes",
    label: "FPL historical minutes",
    provider: "FPL",
    url: null,
    rawPath: null,
    reportPath: null,
    required: true,
    confidence: "medium",
    freshness: {
      status: "fresh",
      checkedAt: "2026-07-04T00:00:00.000Z",
      fetchedAt: "2026-07-04T00:00:00.000Z",
      ageHours: 0,
      maxAgeHours: 24,
      message: "Fresh."
    }
  },
  summary: {
    playersReviewed: 15,
    selectedPlayers: 15,
    selectedStarters: 11,
    secure: 15,
    watch: 0,
    risky: 0,
    unknown: 0,
    selectedWatchOrWorse: 0,
    starterWatchOrWorse: 0
  },
  items: [],
  warnings: []
};

const publicEvidenceReport: PublicEvidenceReport = {
  generatedAt: "2026-07-04T00:00:00.000Z",
  gameweek: 1,
  summary: {
    configuredSources: 1,
    capturedPages: 1,
    failedPages: 0,
    playwrightPages: 1,
    fetchPages: 0,
    signals: 1
  },
  pages: [
    {
      sourceId: "lineups",
      label: "Lineups",
      provider: "Public Source",
      url: "https://example.com",
      area: "predicted-lineups",
      capturedAt: "2026-07-04T00:00:00.000Z",
      captureMode: "playwright",
      title: "Lineups",
      textExcerpt: "Predicted lineups.",
      wordCount: 100,
      rawPath: "raw.txt",
      error: null,
      confidence: "medium"
    }
  ],
  signals: [
    {
      sourceId: "lineups",
      area: "predicted-lineups",
      severity: "watch",
      subject: "Lineups",
      summary: "Predicted lineups.",
      url: "https://example.com",
      confidence: "medium"
    }
  ],
  warnings: []
};

function report(overrides: Partial<WeeklyRecommendation> = {}) {
  return buildSquadRiskReport({
    generatedAt: "2026-07-04T00:00:00.000Z",
    recommendation: {
      ...recommendation,
      ...overrides
    },
    dataStatus: { dataMode: overrides.dataMode ?? recommendation.dataMode },
    fixtureTicker: null,
    oddsReport,
    minutesRiskReport,
    publicEvidenceReport,
    contextNotes: reviewedContext
  });
}

describe("buildSquadRiskReport", () => {
  it("does not create evidence gaps when context has been reviewed", () => {
    const result = report();

    expect(result.summary.evidenceGaps).toBe(0);
    expect(result.summary.high).toBe(0);
    expect(result.structureRisks.find((risk) => risk.risk === "bench-overfunding")?.level).toBe("medium");
  });

  it("flags zero-minute squad players", () => {
    const result = report({
      squadBefore: {
        ...recommendation.squadBefore,
        players: recommendation.squadBefore.players.map((player) =>
          player.id === 7 ? { ...player, minutes: 0 } : player
        )
      }
    });

    expect(result.playerRisks.find((risk) => risk.playerId === 7)?.reasons).toContain(
      "No historical minutes in the available FPL metadata."
    );
  });

  it("flags low-minutes starters", () => {
    const result = report({
      squadBefore: {
        ...recommendation.squadBefore,
        players: recommendation.squadBefore.players.map((player) =>
          player.id === 8 ? { ...player, minutes: 500 } : player
        )
      }
    });

    expect(result.playerRisks.find((risk) => risk.playerId === 8)?.level).toBe("medium");
  });

  it("flags empty manual context files", () => {
    const result = buildSquadRiskReport({
      generatedAt: "2026-07-04T00:00:00.000Z",
      recommendation,
      dataStatus: { dataMode: "official" },
      fixtureTicker: null,
      contextNotes: {
        teamNews: "",
        setPieces: "",
        watchlist: ""
      }
    });

    expect(result.summary.evidenceGaps).toBe(6);
  });

  it("uses automated team-news report instead of manual team-news context", () => {
    const teamNewsReport: TeamNewsReport = {
      generatedAt: "2026-07-04T00:00:00.000Z",
      gameweek: 1,
      source: {
        id: "team-news",
        label: "FPL availability",
        provider: "FPL",
        url: null,
        rawPath: null,
        reportPath: null,
        required: true,
        confidence: "high",
        freshness: {
          status: "fresh",
          checkedAt: "2026-07-04T00:00:00.000Z",
          fetchedAt: "2026-07-04T00:00:00.000Z",
          ageHours: 0,
          maxAgeHours: 24,
          message: "Fresh."
        }
      },
      summary: {
        flaggedPlayers: 1,
        selectedFlaggedPlayers: 1,
        info: 0,
        watch: 0,
        risk: 0,
        avoid: 1
      },
      items: [
        {
          playerId: 8,
          name: "Midfielder 1",
          webName: "Midfielder 1",
          teamId: 3,
          teamName: "Team 3",
          position: "MID",
          status: "i",
          chanceOfPlayingNextRound: 0,
          chanceOfPlayingThisRound: 0,
          news: "Injured",
          newsAdded: "2026-07-04T00:00:00.000Z",
          severity: "avoid",
          selected: true,
          summary: "Injured"
        }
      ],
      warnings: ["Selected player Midfielder 1 has avoid team-news severity: Injured"]
    };
    const result = buildSquadRiskReport({
      generatedAt: "2026-07-04T00:00:00.000Z",
      recommendation,
      dataStatus: { dataMode: "official" },
      fixtureTicker: null,
      teamNewsReport,
      contextNotes: {
        teamNews: "",
        setPieces: "",
        watchlist: ""
      }
    });

    expect(result.evidenceGaps.find((gap) => gap.area === "team-news")?.status).toBe("reviewed");
    expect(result.playerRisks.find((risk) => risk.playerId === 8)?.level).toBe("high");
  });

  it("uses automated set-piece report instead of manual set-piece context", () => {
    const setPieceReport: SetPieceReport = {
      generatedAt: "2026-07-04T00:00:00.000Z",
      gameweek: 1,
      source: {
        id: "set-pieces",
        label: "FPL set pieces",
        provider: "FPL",
        url: null,
        rawPath: null,
        reportPath: null,
        required: true,
        confidence: "high",
        freshness: {
          status: "fresh",
          checkedAt: "2026-07-04T00:00:00.000Z",
          fetchedAt: "2026-07-04T00:00:00.000Z",
          ageHours: 0,
          maxAgeHours: 168,
          message: "Fresh."
        }
      },
      summary: {
        rolePlayers: 1,
        selectedRolePlayers: 1,
        penaltyTakers: 1,
        directFreeKickTakers: 0,
        cornerAndIndirectFreeKickTakers: 0
      },
      items: [
        {
          playerId: 8,
          name: "Midfielder 1",
          webName: "Midfielder 1",
          teamId: 3,
          teamName: "Team 3",
          position: "MID",
          role: "penalties",
          order: 1,
          selected: true,
          status: "a",
          confidence: "high",
          summary: "Midfielder 1 is order 1 for penalties."
        }
      ],
      warnings: []
    };
    const result = buildSquadRiskReport({
      generatedAt: "2026-07-04T00:00:00.000Z",
      recommendation,
      dataStatus: { dataMode: "official" },
      fixtureTicker: null,
      setPieceReport,
      contextNotes: {
        teamNews: "",
        setPieces: "",
        watchlist: ""
      }
    });

    expect(result.evidenceGaps.find((gap) => gap.area === "set-pieces")?.status).toBe("reviewed");
  });

  it("flags full-budget rigidity", () => {
    const result = report({
      squadBefore: {
        ...recommendation.squadBefore,
        bank: 0
      }
    });

    expect(result.structureRisks.find((risk) => risk.risk === "budget-flexibility")?.level).toBe("medium");
  });

  it("flags bench overfunding", () => {
    const result = report({
      pickTeam: {
        ...recommendation.pickTeam,
        benchOrder: [2, 6, 12, 14]
      }
    });

    expect(result.structureRisks.find((risk) => risk.risk === "bench-overfunding")?.level).toBe("medium");
  });

  it("flags odds reports that do not cover the gameweek fixtures", () => {
    const result = buildSquadRiskReport({
      generatedAt: "2026-07-04T00:00:00.000Z",
      recommendation,
      dataStatus: { dataMode: "official" },
      fixtureTicker: null,
      oddsReport: {
        ...oddsReport,
        summary: {
          ...oddsReport.summary,
          matchedFixtures: 0
        }
      },
      contextNotes: reviewedContext
    });

    expect(result.structureRisks.find((risk) => risk.risk === "odds-coverage")?.level).toBe("medium");
    expect(result.evidenceGaps.find((gap) => gap.area === "odds")?.status).toBe("reviewed");
  });

  it("flags false precision when confidence is high without odds or lineup confidence", () => {
    const result = buildSquadRiskReport({
      generatedAt: "2026-07-04T00:00:00.000Z",
      recommendation: {
        ...recommendation,
        confidence: {
          score: 0.72,
          label: "medium",
          explanation: "High confidence."
        }
      },
      dataStatus: { dataMode: "official" },
      fixtureTicker: null,
      oddsReport: {
        ...oddsReport,
        summary: {
          ...oddsReport.summary,
          matchedFixtures: 0
        }
      },
      minutesRiskReport: {
        ...minutesRiskReport,
        items: [
          {
            playerId: 8,
            name: "Midfielder 1",
            webName: "Midfielder 1",
            teamId: 3,
            teamName: "Team 3",
            position: "MID",
            status: "a",
            minutes: 1500,
            selected: true,
            starting: true,
            benchPosition: null,
            historicalConfidence: "medium",
            predictedLineupConfidence: "unavailable",
            riskLevel: "watch",
            reasons: ["Moderate historical minutes: 1500."],
            summary: "Midfielder 1: watch minutes risk."
          }
        ]
      },
      contextNotes: reviewedContext
    });

    expect(result.structureRisks.find((risk) => risk.risk === "false-precision")?.level).toBe("medium");
  });

  it("uses automated minutes report instead of missing minutes evidence", () => {
    const result = buildSquadRiskReport({
      generatedAt: "2026-07-04T00:00:00.000Z",
      recommendation,
      dataStatus: { dataMode: "official" },
      fixtureTicker: null,
      minutesRiskReport: {
        ...minutesRiskReport,
        items: [
          {
            playerId: 8,
            name: "Midfielder 1",
            webName: "Midfielder 1",
            teamId: 3,
            teamName: "Team 3",
            position: "MID",
            status: "a",
            minutes: 1500,
            selected: true,
            starting: true,
            benchPosition: null,
            historicalConfidence: "medium",
            predictedLineupConfidence: "unavailable",
            riskLevel: "watch",
            reasons: ["Moderate historical minutes: 1500."],
            summary: "Midfielder 1: watch minutes risk."
          }
        ]
      },
      contextNotes: reviewedContext
    });

    expect(result.evidenceGaps.find((gap) => gap.area === "minutes")?.status).toBe("reviewed");
    expect(result.playerRisks.find((risk) => risk.playerId === 8)?.level).toBe("medium");
  });

  it("flags provisional data", () => {
    const result = report({
      dataMode: "provisional"
    });

    expect(result.structureRisks.find((risk) => risk.risk === "data-freshness")?.level).toBe("high");
  });

  it("flags high fixture difficulty clusters without naming replacements", () => {
    const fixtureTicker: FixtureTicker = {
      gameweek: 1,
      horizon: 1,
      generatedAt: "2026-07-04T00:00:00.000Z",
      teams: [1, 2, 3].map((teamId) => ({
        teamId,
        teamName: `Team ${teamId}`,
        shortName: `T${teamId}`,
        fixtureCount: 1,
        blankCount: 0,
        doubleCount: 0,
        averageDifficulty: 4,
        difficultySum: 4,
        fixtures: [
          {
            event: 1,
            opponentTeamId: 99,
            opponentName: "Opponent",
            venue: "H",
            difficulty: 4,
            kickoffTime: null,
            finished: false
          }
        ]
      }))
    };
    const result = buildSquadRiskReport({
      generatedAt: "2026-07-04T00:00:00.000Z",
      recommendation,
      dataStatus: { dataMode: "official" },
      fixtureTicker,
      contextNotes: reviewedContext
    });
    const markdown = renderSquadRiskReportMarkdown(result);

    expect(result.structureRisks.find((risk) => risk.risk === "fixture-cluster")?.level).toBe("medium");
    expect(markdown).not.toContain("replace");
  });

  it("flags missing exposure to strongest opening fixture blocks", () => {
    const fixtureTicker: FixtureTicker = {
      gameweek: 1,
      horizon: 2,
      generatedAt: "2026-07-04T00:00:00.000Z",
      teams: [20, 21].map((teamId) => ({
        teamId,
        teamName: `Team ${teamId}`,
        shortName: `T${teamId}`,
        fixtureCount: 2,
        blankCount: 0,
        doubleCount: 0,
        averageDifficulty: 2,
        difficultySum: 4,
        fixtures: [
          {
            event: 1,
            opponentTeamId: 98,
            opponentName: "Opponent 1",
            venue: "H",
            difficulty: 2,
            kickoffTime: null,
            finished: false
          },
          {
            event: 2,
            opponentTeamId: 99,
            opponentName: "Opponent 2",
            venue: "A",
            difficulty: 2,
            kickoffTime: null,
            finished: false
          }
        ]
      }))
    };
    const result = buildSquadRiskReport({
      generatedAt: "2026-07-04T00:00:00.000Z",
      recommendation,
      dataStatus: { dataMode: "official" },
      fixtureTicker,
      contextNotes: reviewedContext
    });

    expect(result.structureRisks.find((risk) => risk.risk === "fixture-upside-gap")?.level).toBe("medium");
  });
});
