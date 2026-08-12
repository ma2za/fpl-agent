import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildDraftDeltaReport,
  buildRobustnessReport,
  renderDraftDeltaMarkdown,
  renderRobustnessMarkdown,
  type PlayerForEngine,
  type ProbabilisticProjection
} from "../packages/engine/src";
import {
  DraftDeltaReportSchema,
  ProbabilisticProjectionArraySchema,
  RobustnessReportSchema,
  readArtifactFile,
  WeeklyRecommendationSchema,
  type WeeklyRecommendation
} from "../packages/agent/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function reportFor(
  recommendation: WeeklyRecommendation,
  projections: ProbabilisticProjection[],
  generatedAt: string,
  thresholds: number[]
) {
  return buildRobustnessReport({
    generatedAt,
    gameweek: recommendation.gameweek,
    players: recommendation.squadBefore.players as PlayerForEngine[],
    projections,
    startingXI: recommendation.pickTeam.startingXI,
    benchOrder: recommendation.pickTeam.benchOrder,
    thresholds
  });
}

async function main() {
  const gameweek = Number(argValue("--gw") ?? 1);
  const directory = path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const recommendationPath = argValue("--recommendation") ?? path.join(directory, "recommendation.json");
  const projectionsPath = argValue("--projections") ?? path.join(directory, "probabilistic-projections.json");
  const outputDir = argValue("--out") ?? directory;
  const generatedAt = new Date().toISOString();
  const thresholds = (argValue("--thresholds") ?? "40,50,60")
    .split(",")
    .map(Number)
    .filter(Number.isFinite);
  const recommendation = await readArtifactFile(recommendationPath, WeeklyRecommendationSchema);
  if (thresholds.length === 0) throw new Error("At least one numeric squad-point threshold is required.");
  const projections = await readArtifactFile(projectionsPath, ProbabilisticProjectionArraySchema) as ProbabilisticProjection[];
  const report = RobustnessReportSchema.parse(reportFor(recommendation, projections, generatedAt, thresholds));

  await mkdir(outputDir, { recursive: true });
  await writeJson(path.join(outputDir, "robustness-report.json"), report);
  await writeFile(path.join(outputDir, "robustness-report.md"), renderRobustnessMarkdown(report), "utf8");

  const previousPath = argValue("--previous");
  if (previousPath) {
    const previousRecommendation = await readArtifactFile(previousPath, WeeklyRecommendationSchema);
    const previous = reportFor(previousRecommendation, projections, generatedAt, thresholds);
    const delta = DraftDeltaReportSchema.parse(buildDraftDeltaReport({
      generatedAt,
      previousLabel: path.basename(path.dirname(previousPath)),
      currentLabel: path.basename(path.dirname(recommendationPath)),
      previous,
      current: report
    }));
    await writeJson(path.join(outputDir, "draft-delta-report.json"), delta);
    await writeFile(path.join(outputDir, "draft-delta-report.md"), renderDraftDeltaMarkdown(delta), "utf8");
  }

  console.log(`Wrote squad utility artifacts to ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
