import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderAgentBrief, renderManualChecklist } from "./markdown";
import type { RecommendationFiles } from "./types";

async function writeJson(filePath: string, data: unknown) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function writeRecommendationFiles(outputDir: string, files: RecommendationFiles) {
  await mkdir(outputDir, { recursive: true });

  await writeJson(path.join(outputDir, "recommendation.json"), files.recommendation);
  await writeJson(path.join(outputDir, "projections.json"), files.projections);
  await writeJson(path.join(outputDir, "transfer-candidates.json"), files.transferCandidates);
  await writeJson(path.join(outputDir, "captain-candidates.json"), files.captainCandidates);
  await writeJson(path.join(outputDir, "legality-report.json"), files.legalityReport);
  await writeFile(
    path.join(outputDir, "agent-brief.md"),
    renderAgentBrief(files.recommendation),
    "utf8"
  );

  if (!files.legalityReport.isValid) {
    return;
  }

  await writeFile(
    path.join(outputDir, "manual-checklist.md"),
    renderManualChecklist(files.recommendation),
    "utf8"
  );
}
