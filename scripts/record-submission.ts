import path from "node:path";
import { confirmActiveDecisionSubmission } from "../packages/agent/src";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main() {
  const gameweek = Number(argument("--gw"));
  const source = argument("--source");
  const reference = argument("--reference");
  if (!Number.isInteger(gameweek) || gameweek < 1 || !["manager_confirmation", "public_fpl_api"].includes(String(source)) || !reference) {
    throw new Error("Usage: pnpm decision:submit -- --gw <n> --source <manager_confirmation|public_fpl_api> --reference <value>");
  }
  const manifest = await confirmActiveDecisionSubmission({
    sourceDir: path.join("packages", "content", "recommendations", `gw-${gameweek}`),
    gameweek,
    confirmedAt: new Date().toISOString(),
    source: source as "manager_confirmation" | "public_fpl_api",
    reference
  });
  console.log(`GW${gameweek} submission confirmed for ${manifest.selectedCandidateId}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
