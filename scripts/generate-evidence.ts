import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderEvidenceReportMarkdown } from "../packages/agent/src";
import { buildLocalEvidenceReport } from "./evidence-sources";

function argValue(name: string) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

async function main() {
  const gameweek = Number(argValue("--gw") ?? 1);

  if (!Number.isInteger(gameweek) || gameweek < 1) {
    console.error("Usage: pnpm evidence -- --gw <gameweek>");
    process.exitCode = 1;
    return;
  }

  const outputDir = path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const report = await buildLocalEvidenceReport({
    gameweek,
    generatedAt: new Date().toISOString()
  });

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "evidence-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "evidence-report.md"), renderEvidenceReportMarkdown(report), "utf8");
  console.log(
    `Wrote evidence report to ${outputDir}: ${report.summary.fresh} fresh, ${report.summary.stale} stale, ${report.summary.missing} missing.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
