import type {
  AgentRoleEvidenceInput,
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

export type CodingAgentRoleEvidenceInput = AgentRoleEvidenceInput;

export function currentRoleAdapterInputs(
  configs: RoleEvidenceAdapterConfig[],
  players: AvailabilityPlayer[],
  generatedAt: string,
  agentEvidence?: CodingAgentRoleEvidenceInput | null
): RoleEvidenceAdapterInput[] {
  const evidenceById = new Map((agentEvidence?.adapters ?? []).map((adapter) => [adapter.id, adapter]));
  const sourceById = new Map((agentEvidence?.sources ?? []).map((source) => [source.id, source]));

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

    const input = evidenceById.get(config.id);
    const records = input?.records?.map((record) => {
      const sourceReliability = record.sourceIds
        ?.map((sourceId) => sourceById.get(sourceId)?.reliability)
        .filter((value): value is number => typeof value === "number");

      return {
        ...record,
        sourceReliability: sourceReliability && sourceReliability.length > 0
          ? Math.min(...sourceReliability)
          : 1
      };
    });
    return { config, records, error: input?.error };
  });
}
