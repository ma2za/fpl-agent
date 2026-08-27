import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildCalibrationReport, openPlayerStore } from "../packages/player-store/src";

export async function generateCalibrationReport(input: { storePath?: string; outputDir?: string; generatedAt?: string }) {
  const storePath = input.storePath ?? path.join("data", "player-intelligence", "player-intelligence.sqlite");
  const outputDir = input.outputDir ?? path.join("data", "gameweek-archive", "calibration");
  const db = openPlayerStore(storePath, { readonly: true });
  try {
    const report = buildCalibrationReport(db, input.generatedAt ?? new Date().toISOString());
    const markdown = `# Forecast Calibration\n\nEligible observations: ${report.summary.eligible}; excluded: ${report.summary.excluded}.\n\n` +
      `Parameter proposal: ${report.parameterChangeProposal.eligible ? "threshold met" : "blocked"}. ${report.parameterChangeProposal.note}\n\n` +
      `| Cohort | Value | N | Points MAE | Minutes error | Start Brier | Appearance Brier | Interval coverage |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |\n` +
      report.cohorts.map((item) => `| ${item.dimension} | ${item.value} | ${item.sampleSize} | ${item.meanAbsolutePointsError.toFixed(3)} | ${item.meanMinutesError.toFixed(3)} | ${item.startBrier.toFixed(3)} | ${item.appearanceBrier.toFixed(3)} | ${(item.pointsIntervalCoverage * 100).toFixed(1)}% |`).join("\n") + "\n";
    await mkdir(outputDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(outputDir, "calibration-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
      writeFile(path.join(outputDir, "calibration-report.md"), markdown, "utf8")
    ]);
    return report;
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateCalibrationReport({}).then((report) => console.log(`Calibration report: ${report.summary.eligible} eligible rows.`))
    .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
