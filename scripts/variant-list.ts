import { listAuthoredVariants } from "../packages/agent/src";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main() {
  const rawGameweek = argValue("--gw");
  const gameweek = Number(rawGameweek);

  if (!rawGameweek || !Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
    console.error("Usage: pnpm variant:list -- --gw <1-38>");
    process.exitCode = 1;
    return;
  }

  const variants = await listAuthoredVariants("packages/content/recommendations", gameweek);

  if (variants.length === 0) {
    console.log(`No authored variants found for GW${gameweek}.`);
    return;
  }

  for (const slug of variants) {
    console.log(slug);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
