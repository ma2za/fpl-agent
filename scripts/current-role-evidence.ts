import type {
  RoleEvidenceAdapterConfig,
  RoleEvidenceAdapterInput,
  RoleEvidenceRecord
} from "../packages/agent/src";

type AvailabilityPlayer = {
  id: number;
  status: string;
  chance_of_playing_next_round?: number | null;
  news?: string;
  news_added?: string | null;
};

export type ReviewedRoleEvidenceInput = {
  adapters: Array<{
    id: string;
    records?: RoleEvidenceRecord[];
    error?: string;
  }>;
};

export function currentRoleAdapterInputs(
  configs: RoleEvidenceAdapterConfig[],
  players: AvailabilityPlayer[],
  generatedAt: string,
  reviewed?: ReviewedRoleEvidenceInput | null
): RoleEvidenceAdapterInput[] {
  const reviewedById = new Map((reviewed?.adapters ?? []).map((adapter) => [adapter.id, adapter]));

  return configs.map((config) => {
    if (config.kind === "official_availability") {
      return {
        config,
        records: players.map((player): RoleEvidenceRecord => ({
          playerId: player.id,
          dimension: player.status === "a" ? "historical_availability" : "injury_status",
          signal: player.status === "a" ? "neutral" : "opposes_start",
          value: player.chance_of_playing_next_round ?? player.status,
          observedAt: player.news_added ?? generatedAt,
          note: player.news?.trim() || `FPL availability status ${player.status}.`
        }))
      };
    }

    const input = reviewedById.get(config.id);
    return { config, records: input?.records, error: input?.error };
  });
}
