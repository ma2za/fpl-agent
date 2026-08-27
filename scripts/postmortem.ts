import { readFile } from "node:fs/promises";
import path from "node:path";
import { GameweekPostmortemSchema } from "../packages/agent/src/postmortem";

async function main() {
  const gwIndex = process.argv.indexOf("--gw");
  const gameweek = gwIndex === -1 ? 1 : Number(process.argv[gwIndex + 1]);
  const filePath = path.join("packages", "content", "postmortems", `gw-${gameweek}.json`);
  const postmortem = GameweekPostmortemSchema.parse(JSON.parse(await readFile(filePath, "utf8")));

  console.log(JSON.stringify({
    gameweek: postmortem.gameweek,
    totalPoints: postmortem.manager.totalPoints,
    averagePoints: postmortem.manager.gameweekAverage,
    aiSelectionCounterfactual: postmortem.aiSelection.actualPointsCounterfactual,
    managerOverrideDelta: postmortem.counterfactuals.managerOverrideDelta,
    captaincyCounterfactual: postmortem.counterfactuals.viceCaptainAsCaptainPoints
  }, null, 2));
}

main();
