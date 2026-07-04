import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyRecommendation, type VerifyRecommendationResult, type WeeklyRecommendation } from "../packages/agent/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function isWeeklyRecommendation(value: unknown): value is WeeklyRecommendation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const recommendation = value as Partial<WeeklyRecommendation>;

  return Array.isArray(recommendation.squadBefore?.players) &&
    recommendation.recommendedAction !== null &&
    recommendation.recommendedAction !== undefined &&
    recommendation.pickTeam !== null &&
    recommendation.pickTeam !== undefined &&
    recommendation.captaincy !== null &&
    recommendation.captaincy !== undefined &&
    recommendation.chip !== null &&
    recommendation.chip !== undefined &&
    recommendation.manualExecutionRequired === true;
}

async function main() {
  const gameweek = argValue("--gw");

  if (!gameweek) {
    console.error("Usage: pnpm verify -- --gw <gameweek>");
    process.exitCode = 1;
    return;
  }

  const outputDir = path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const recommendationPath = path.join(outputDir, "recommendation.json");
  const legalityPath = path.join(outputDir, "legality-report.json");
  const recommendation = await readJson<unknown>(recommendationPath);
  const legality: VerifyRecommendationResult = isWeeklyRecommendation(recommendation)
    ? verifyRecommendation(recommendation, {
      forceDeadline: process.argv.includes("--force-deadline")
    })
    : {
      isValid: false,
      errors: ["Final recommendation has not been authored by the coding agent."],
      warnings: ["Run evidence prep first, then author recommendation.json manually from current evidence."],
      quality: {
        isValid: false,
        errors: ["Final recommendation has not been authored by the coding agent."],
        warnings: [],
        gates: [
          {
            gate: "authored-recommendation",
            status: "fail",
            message: "Final recommendation has not been authored by the coding agent."
          }
        ]
      }
    };

  await writeFile(legalityPath, `${JSON.stringify(legality, null, 2)}\n`, "utf8");

  if (!legality.isValid) {
    console.error(`Recommendation failed verification. See ${legalityPath}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Recommendation passed verification. See ${legalityPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
