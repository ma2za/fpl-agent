import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderAgentBrief, renderManualChecklist } from "./markdown";
import { evaluatePublicationGate } from "./decisionConsistency";
import type { RecommendationFiles } from "./types";

async function writeJson(filePath: string, data: unknown) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function writeRecommendationFiles(outputDir: string, files: RecommendationFiles) {
  await mkdir(outputDir, { recursive: true });
  const publicationGate = evaluatePublicationGate(files.recommendation);

  await writeJson(path.join(outputDir, "recommendation.json"), files.recommendation);
  await writeJson(path.join(outputDir, "projections.json"), files.projections);
  await writeJson(path.join(outputDir, "transfer-candidates.json"), files.transferCandidates);
  await writeJson(path.join(outputDir, "captain-candidates.json"), files.captainCandidates);
  await writeJson(path.join(outputDir, "legality-report.json"), files.legalityReport);
  if (!files.legalityReport.isValid || publicationGate.publicationStatus === "invalid") {
    const errors = [...files.legalityReport.errors, ...publicationGate.errors];
    await writeFile(
      path.join(outputDir, "agent-brief.md"),
      `# Recommendation Not Published\n\nPublication status: invalid\n\n${errors.map((error) => `- ${error}`).join("\n")}\n`,
      "utf8"
    );
    return;
  }

  await writeFile(
    path.join(outputDir, "agent-brief.md"),
    renderAgentBrief(files.recommendation),
    "utf8"
  );

  await writeFile(
    path.join(outputDir, "manual-checklist.md"),
    renderManualChecklist(files.recommendation),
    "utf8"
  );
}
