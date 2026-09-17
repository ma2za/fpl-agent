import path from "node:path";
import { promoteActiveDecision } from "../packages/agent/src";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main() {
  const gameweek = Number(argument("--gw"));
  const variant = argument("--variant");
  const archiveState = argument("--archive-state");
  const supersessionReason = argument("--supersede-reason");
  if (!Number.isInteger(gameweek) || gameweek < 1 || !variant ||
      (archiveState && !["not_archived", "archived", "earlier_immutable_variant"].includes(archiveState))) {
    throw new Error("Usage: pnpm decision:activate -- --gw <n> --variant <slug> [--archive-state <not_archived|archived|earlier_immutable_variant>] [--supersede-reason <reason>]");
  }
  const manifest = await promoteActiveDecision({
    sourceDir: path.join("packages", "content", "recommendations", `gw-${gameweek}`),
    gameweek,
    variant,
    updatedAt: new Date().toISOString(),
    archiveState: archiveState as "not_archived" | "archived" | "earlier_immutable_variant" | undefined,
    supersessionReason: supersessionReason ?? undefined
  });
  console.log(`GW${gameweek} active decision: ${manifest.selectedCandidateId} (${manifest.variant}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
