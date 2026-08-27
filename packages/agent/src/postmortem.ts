import { z } from "zod";

const PickSchema = z.object({
  playerId: z.number().int().positive(),
  name: z.string().min(1),
  position: z.enum(["GKP", "DEF", "MID", "FWD"]),
  role: z.enum(["starter", "bench"]),
  rawPoints: z.number().int(),
  multiplier: z.number().int().min(0).max(3),
  countedPoints: z.number().int()
}).strict();

export const GameweekPostmortemSchema = z.object({
  schemaVersion: z.literal(1),
  artifactKind: z.literal("gameweek_postmortem"),
  gameweek: z.number().int().min(1).max(38),
  source: z.string().url(),
  manager: z.object({
    entryId: z.number().int().positive(),
    teamName: z.string().min(1),
    totalPoints: z.number().int(),
    overallPoints: z.number().int(),
    gameweekAverage: z.number().int(),
    gameweekHighest: z.number().int(),
    gameweekRank: z.number().int().positive(),
    overallRank: z.number().int().positive(),
    totalPlayers: z.number().int().positive(),
    teamValue: z.number().positive(),
    bank: z.number().nonnegative(),
    transfers: z.number().int().nonnegative()
  }).strict(),
  aiSelection: z.object({
    candidateId: z.string().min(1),
    projectedPoints: z.number(),
    actualPointsCounterfactual: z.number().int(),
    sourcePath: z.string().min(1)
  }).strict(),
  submittedSelection: z.object({
    formation: z.string().min(1),
    captainPlayerId: z.number().int().positive(),
    viceCaptainPlayerId: z.number().int().positive(),
    picks: z.array(PickSchema).length(15)
  }).strict(),
  managerOverrides: z.array(z.object({
    outPlayerId: z.number().int().positive(),
    outName: z.string().min(1),
    outPoints: z.number().int(),
    inPlayerId: z.number().int().positive(),
    inName: z.string().min(1),
    inPoints: z.number().int(),
    pointsDelta: z.number().int()
  }).strict()),
  counterfactuals: z.object({
    managerOverrideDelta: z.number().int(),
    viceCaptainAsCaptainPoints: z.number().int(),
    captaincyDelta: z.number().int(),
    unusedBenchPoints: z.number().int()
  }).strict(),
  lessons: z.array(z.string().min(1)).min(1)
}).strict().superRefine((postmortem, context) => {
  const starters = postmortem.submittedSelection.picks.filter((pick) => pick.role === "starter");
  const bench = postmortem.submittedSelection.picks.filter((pick) => pick.role === "bench");
  const countedPoints = starters.reduce((sum, pick) => sum + pick.countedPoints, 0);
  const overrideDelta = postmortem.managerOverrides.reduce((sum, item) => sum + item.pointsDelta, 0);
  const unusedBenchPoints = bench.reduce((sum, pick) => sum + pick.rawPoints, 0);
  const captain = starters.find((pick) => pick.playerId === postmortem.submittedSelection.captainPlayerId);
  const viceCaptain = starters.find((pick) => pick.playerId === postmortem.submittedSelection.viceCaptainPlayerId);

  if (starters.length !== 11 || bench.length !== 4) {
    context.addIssue({ code: "custom", message: "Selection must contain 11 starters and four bench players." });
  }
  if (countedPoints !== postmortem.manager.totalPoints) {
    context.addIssue({ code: "custom", message: "Starter points do not match the manager total." });
  }
  if (overrideDelta !== postmortem.counterfactuals.managerOverrideDelta) {
    context.addIssue({ code: "custom", message: "Manager override delta is inconsistent." });
  }
  if (postmortem.aiSelection.actualPointsCounterfactual + overrideDelta !== postmortem.manager.totalPoints) {
    context.addIssue({ code: "custom", message: "AI counterfactual does not reconcile to the submitted result." });
  }
  if (unusedBenchPoints !== postmortem.counterfactuals.unusedBenchPoints) {
    context.addIssue({ code: "custom", message: "Unused bench points are inconsistent." });
  }
  if (!captain || !viceCaptain || captain.multiplier !== 2 || viceCaptain.multiplier !== 1) {
    context.addIssue({ code: "custom", message: "Captain and vice-captain assignments are inconsistent." });
  } else {
    const captainSwapPoints = countedPoints - captain.rawPoints + viceCaptain.rawPoints;
    if (captainSwapPoints !== postmortem.counterfactuals.viceCaptainAsCaptainPoints) {
      context.addIssue({ code: "custom", message: "Captaincy counterfactual is inconsistent." });
    }
    if (captainSwapPoints - countedPoints !== postmortem.counterfactuals.captaincyDelta) {
      context.addIssue({ code: "custom", message: "Captaincy delta is inconsistent." });
    }
  }
  for (const item of postmortem.managerOverrides) {
    if (item.inPoints - item.outPoints !== item.pointsDelta) {
      context.addIssue({ code: "custom", message: `Override delta is inconsistent for player ${item.inPlayerId}.` });
    }
  }
  for (const pick of postmortem.submittedSelection.picks) {
    if (pick.countedPoints !== pick.rawPoints * pick.multiplier) {
      context.addIssue({ code: "custom", message: `Counted points are inconsistent for player ${pick.playerId}.` });
    }
  }
});

export type GameweekPostmortem = z.infer<typeof GameweekPostmortemSchema>;
