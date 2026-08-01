import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  compareAuthoredVariants,
  readArtifactFile,
  renderVariantComparisonMarkdown,
  variantRecommendationPath,
  VariantComparisonReportSchema,
  WeeklyRecommendationSchema
} from "../packages/agent/src";
import { RISK_PROFILE } from "../config/risk-profile";
import { loadVariantSharedEvidence } from "./variant-evidence";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main() {
  const rawGameweek = argValue("--gw");
  const slugA = argValue("--a");
  const slugB = argValue("--b");
  const gameweek = Number(rawGameweek);

  if (!rawGameweek || !slugA || !slugB || !Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
    console.error("Usage: pnpm variant:compare -- --gw <1-38> --a <slug> --b <slug> [--out <dir>]");
    process.exitCode = 1;
    return;
  }

  const recommendationsRoot = path.join("packages", "content", "recommendations");
  const recommendationPathA = variantRecommendationPath(recommendationsRoot, gameweek, slugA);
  const recommendationPathB = variantRecommendationPath(recommendationsRoot, gameweek, slugB);
  const [recommendationA, recommendationB, evidence] = await Promise.all([
    readArtifactFile(recommendationPathA, WeeklyRecommendationSchema),
    readArtifactFile(recommendationPathB, WeeklyRecommendationSchema),
    loadVariantSharedEvidence(gameweek)
  ]);
  const report = compareAuthoredVariants({
    generatedAt: new Date().toISOString(),
    gameweek,
    slugA,
    slugB,
    recommendationPathA,
    recommendationPathB,
    recommendationA,
    recommendationB,
    riskProfile: RISK_PROFILE,
    evidence,
    forceDeadline: process.argv.includes("--force-deadline")
  });
  const outputDir = argValue("--out") ?? path.join(
    recommendationsRoot,
    `gw-${gameweek}`,
    "variants",
    "comparisons",
    `${slugA}-vs-${slugB}`
  );
  VariantComparisonReportSchema.parse(report);

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDir, "variant-comparison.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDir, "variant-comparison.md"), renderVariantComparisonMarkdown(report), "utf8")
  ]);

  if (!report.verification.a.isValid || !report.verification.b.isValid) {
    console.error(`Variant comparison contains an invalid recommendation. See ${outputDir}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Wrote neutral variant comparison to ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
