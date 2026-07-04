import { BootstrapStatic, NormalizedPlayer } from "./types";

function toNullableNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizePlayers(data: BootstrapStatic): NormalizedPlayer[] {
  const positions = new Map(
    data.element_types.map((elementType) => [
      elementType.id,
      elementType.singular_name_short
    ])
  );
  const teams = new Map(data.teams.map((team) => [team.id, team.name]));

  return data.elements.map((player) => ({
    id: player.id,
    name: `${player.first_name} ${player.second_name}`.trim(),
    webName: player.web_name,
    nowCost: player.now_cost,
    price: player.now_cost / 10,
    position: positions.get(player.element_type) ?? "UNK",
    team: teams.get(player.team) ?? "Unknown",
    teamId: player.team,
    elementType: player.element_type,
    status: player.status,
    chanceOfPlayingNextRound: player.chance_of_playing_next_round ?? null,
    chanceOfPlayingThisRound: player.chance_of_playing_this_round ?? null,
    expectedPointsNext: toNullableNumber(player.ep_next),
    expectedPointsThis: toNullableNumber(player.ep_this),
    form: toNullableNumber(player.form),
    minutes: player.minutes ?? null,
    selectedByPercent: toNullableNumber(player.selected_by_percent),
    totalPoints: player.total_points ?? null
  }));
}
