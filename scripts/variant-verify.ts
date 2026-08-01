import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  readArtifactFile,
  renderAgentBrief,
  renderManualChecklist,
  renderSquadRiskReportMarkdown,
  variantDirectory,
  variantRecommendationPath,
  verifyAuthoredVariant,
  WeeklyRecommendationSchema
} from "../packages/agent/src";
import { RISK_PROFILE } from "../config/risk-profile";
import { loadVariantSharedEvidence } from "./variant-evidence";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const rawGameweek = argValue("--gw");
  const slug = argValue("--variant");
  const gameweek = Number(rawGameweek);

  if (!rawGameweek || !slug || !Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
    console.error("Usage: pnpm variant:verify -- --gw <1-38> --variant <slug>");
    process.exitCode = 1;
    return;
  }

  const recommendationsRoot = path.join("packages", "content", "recommendations");
  const recommendationPath = variantRecommendationPath(recommendationsRoot, gameweek, slug);
  const outputDir = variantDirectory(recommendationsRoot, gameweek, slug);
  const [recommendation, evidence] = await Promise.all([
    readArtifactFile(recommendationPath, WeeklyRecommendationSchema),
    loadVariantSharedEvidence(gameweek)
  ]);
  const report = verifyAuthoredVariant({
    slug,
    recommendationPath,
    recommendation,
    expectedGameweek: gameweek,
    generatedAt: new Date().toISOString(),
    riskProfile: RISK_PROFILE,
    evidence,
    forceDeadline: process.argv.includes("--force-deadline")
  });

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeJson(path.join(outputDir, "legality-report.json"), report.verification),
    writeJson(path.join(outputDir, "risk-report.json"), report.riskReport),
    writeFile(path.join(outputDir, "risk-report.md"), renderSquadRiskReportMarkdown(report.riskReport), "utf8"),
    writeFile(path.join(outputDir, "agent-brief.md"), renderAgentBrief(recommendation), "utf8"),
    writeFile(path.join(outputDir, "manual-checklist.md"), renderManualChecklist(recommendation), "utf8")
  ]);

  if (!report.verification.isValid) {
    console.error(`Variant failed verification. See ${path.join(outputDir, "legality-report.json")}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Variant passed verification. See ${path.join(outputDir, "legality-report.json")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
