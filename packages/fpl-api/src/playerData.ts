import type { NormalizedPlayer, Player, PlayerSummary } from "./types";

function searchable(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function resolvePlayerSelectors(players: NormalizedPlayer[], selectors: string[]) {
  return selectors.map((selector) => {
    const numericId = Number(selector);
    const exactId = Number.isInteger(numericId)
      ? players.find((player) => player.id === numericId)
      : undefined;

    if (exactId) return exactId;

    const query = searchable(selector);
    const exactMatches = players.filter((player) =>
      [player.name, player.webName].some((value) => searchable(value) === query)
    );

    if (exactMatches.length === 1) return exactMatches[0];

    const partialMatches = players.filter((player) =>
      [player.name, player.webName].some((value) => searchable(value).includes(query))
    );

    if (partialMatches.length === 1) return partialMatches[0];
    if (exactMatches.length > 1 || partialMatches.length > 1) {
      const matches = exactMatches.length > 1 ? exactMatches : partialMatches;
      throw new Error(`Player selector "${selector}" is ambiguous: ${matches.map((player) => `${player.webName} (${player.id})`).join(", ")}`);
    }

    throw new Error(`Player selector "${selector}" did not match an official FPL player.`);
  });
}

export function buildOfficialPlayerData(input: {
  retrievedAt: string;
  rawPlayer: Player;
  player: NormalizedPlayer;
  summary: PlayerSummary;
}) {
  return {
    schemaVersion: 1 as const,
    retrievedAt: input.retrievedAt,
    source: {
      provider: "Fantasy Premier League",
      profileUrl: `https://fantasy.premierleague.com/api/element-summary/${input.player.id}/`,
      bootstrapUrl: "https://fantasy.premierleague.com/api/bootstrap-static/"
    },
    player: input.player,
    officialFields: input.rawPlayer,
    fixtures: input.summary.fixtures,
    currentSeasonHistory: input.summary.history,
    previousSeasons: input.summary.history_past
  };
}
