import type {
  CurrentRoleItem,
  CurrentRoleReport,
  NormalizedRoleEvidence,
  RoleEvidenceAdapterInput,
  RoleEvidenceAdapterKind,
  RoleEvidenceDimension,
  RoleEvidenceRecord
} from "./types";

const dimensions: RoleEvidenceDimension[] = [
  "historical_availability",
  "historical_starts",
  "current_manager_preference",
  "preseason_start_rate",
  "predicted_lineup_consensus",
  "injury_status",
  "squad_competition",
  "substitution_patterns",
  "set_piece_roles"
];

const weights: Record<RoleEvidenceAdapterKind | "previous_season_starts" | "historical_minutes", number> = {
  official_availability: 0.9,
  manager_confirmation: 0.95,
  official_club: 0.9,
  preseason_lineup: 0.65,
  predicted_lineup: 0.75,
  reviewed_manual: 1,
  previous_season_starts: 0.45,
  historical_minutes: 0.3
};

type RolePlayer = {
  id: number;
  first_name?: string;
  second_name?: string;
  web_name?: string;
  name?: string;
  status: string;
  chance_of_playing_next_round?: number | null;
  minutes?: number | null;
  starts?: number | null;
  appearances?: number | null;
  historical_observed_at?: string | null;
};

type BuildCurrentRoleReportInput = {
  generatedAt: string;
  gameweek: number;
  players: RolePlayer[];
  adapters: RoleEvidenceAdapterInput[];
  selectedPlayerIds?: number[];
};

function playerName(player: RolePlayer) {
  return player.name ?? (`${player.first_name ?? ""} ${player.second_name ?? ""}`.trim() || player.web_name || `Player ${player.id}`);
}

function decay(ageDays: number, halfLifeDays: number) {
  return 2 ** (-ageDays / halfLifeDays);
}

function normalizeRecord(
  record: RoleEvidenceRecord,
  sourceId: string,
  provider: string,
  sourceKind: NormalizedRoleEvidence["sourceKind"],
  reliability: number,
  generatedAt: string
): NormalizedRoleEvidence {
  const ageDays = Math.max(0, (Date.parse(generatedAt) - Date.parse(record.observedAt)) / 86_400_000);
  const historical = sourceKind === "previous_season_starts" || sourceKind === "historical_minutes";
  const baseWeight = weights[sourceKind];

  return {
    ...record,
    sourceId,
    provider,
    sourceKind,
    baseWeight,
    effectiveWeight: Number((baseWeight * reliability * decay(ageDays, historical ? 60 : 14)).toFixed(4)),
    ageDays: Number(ageDays.toFixed(2))
  };
}

function historicalRecords(player: RolePlayer, generatedAt: string) {
  const records: NormalizedRoleEvidence[] = [];
  const historicalObservedAt = player.historical_observed_at ?? generatedAt;
  const statusSignal = player.status === "a" ? "neutral" : "opposes_start";
  records.push(normalizeRecord({
    playerId: player.id,
    dimension: player.status === "a" ? "historical_availability" : "injury_status",
    signal: statusSignal,
    value: player.chance_of_playing_next_round ?? player.status,
    observedAt: generatedAt,
    note: `FPL availability status ${player.status}.`
  }, "fpl-availability", "Fantasy Premier League", "official_availability", 1, generatedAt));

  if (typeof player.starts === "number" && typeof player.appearances === "number" && player.appearances > 0) {
    const rate = player.starts / player.appearances;
    records.push(normalizeRecord({
      playerId: player.id,
      dimension: "historical_starts",
      signal: rate >= 0.75 ? "supports_start" : rate <= 0.3 ? "opposes_start" : "neutral",
      value: Number(rate.toFixed(3)),
      observedAt: historicalObservedAt,
      note: `${player.starts} starts in ${player.appearances} appearances.`
    }, "previous-season-starts", "Fantasy Premier League history", "previous_season_starts", 1, generatedAt));
  }

  if (typeof player.minutes === "number") {
    records.push(normalizeRecord({
      playerId: player.id,
      dimension: "historical_starts",
      signal: player.minutes >= 2400 ? "supports_start" : player.minutes < 1200 ? "opposes_start" : "neutral",
      value: player.minutes,
      observedAt: historicalObservedAt,
      note: `${player.minutes} historical minutes.`
    }, "historical-minutes", "Fantasy Premier League history", "historical_minutes", 1, generatedAt));
  }

  return records;
}

function emptyDimensions() {
  return Object.fromEntries(dimensions.map((dimension) => [dimension, []])) as unknown as CurrentRoleItem["dimensions"];
}

function classify(records: NormalizedRoleEvidence[]) {
  const overrides = records
    .filter((record) => record.sourceKind === "reviewed_manual" && record.override && record.signal !== "neutral")
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  const overrideSignal = overrides[0]?.signal;
  const manualOverride = overrideSignal === "supports_start" || overrideSignal === "opposes_start" ? overrideSignal : null;
  const directional = records.filter((record) => record.signal !== "neutral");
  const positiveWeight = directional
    .filter((record) => record.signal === "supports_start")
    .reduce((sum, record) => sum + record.effectiveWeight, 0);
  const negativeWeight = directional
    .filter((record) => record.signal === "opposes_start")
    .reduce((sum, record) => sum + record.effectiveWeight, 0);
  const totalWeight = positiveWeight + negativeWeight;
  const currentEvidencePresent = records.some((record) =>
    !["historical_minutes", "previous_season_starts"].includes(record.sourceKind) &&
    record.dimension !== "historical_availability" &&
    record.signal !== "neutral"
  );
  const disagreement = positiveWeight >= 0.2 && negativeWeight >= 0.2;
  let supportScore = totalWeight === 0 ? 0.5 : positiveWeight / totalWeight;
  let confidence = Math.min(1, totalWeight / 1.2);

  if (!currentEvidencePresent) confidence = Math.min(0.45, confidence);
  if (manualOverride === "supports_start") {
    supportScore = 1;
    confidence = 1;
  } else if (manualOverride === "opposes_start") {
    supportScore = 0;
    confidence = 1;
  }

  const status = manualOverride === "opposes_start"
    ? "INSUFFICIENT"
    : currentEvidencePresent && supportScore >= 0.8 && confidence >= 0.7 && !disagreement
      ? "READY"
      : currentEvidencePresent && supportScore >= 0.6 && confidence >= 0.55
        ? "CAUTION"
        : "INSUFFICIENT";

  return {
    status,
    supportScore: Number(supportScore.toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    currentEvidencePresent,
    manualOverride,
    disagreement
  } as const;
}

export function buildCurrentRoleReport(input: BuildCurrentRoleReportInput): CurrentRoleReport {
  const adapterStatuses = input.adapters.map(({ config, records, error }) => {
    const status = !config.enabled ? "disabled" : error ? "failed" : records ? "loaded" : "missing";
    return {
      id: config.id,
      kind: config.kind,
      provider: config.provider,
      status,
      recordCount: records?.length ?? 0,
      message: !config.enabled ? "Adapter is disabled." : error ?? (records ? `Loaded ${records.length} records.` : "Adapter has no reviewed input.")
    } as const;
  });
  const adapterRecords = input.adapters.flatMap(({ config, records }) =>
    !config.enabled || !records ? [] : records.map((record) => normalizeRecord(
      record,
      config.id,
      config.provider,
      config.kind,
      config.reliability,
      input.generatedAt
    ))
  );
  const selectedIds = new Set(input.selectedPlayerIds ?? []);
  const items = input.players.map((player): CurrentRoleItem => {
    const records = [
      ...historicalRecords(player, input.generatedAt),
      ...adapterRecords.filter((record) => record.playerId === player.id)
    ];
    const grouped = emptyDimensions();
    for (const record of records) grouped[record.dimension].push(record);
    const classification = classify(records);
    const warnings = [
      ...(!classification.currentEvidencePresent ? ["No current-role evidence is present; historical evidence cannot produce READY."] : []),
      ...(classification.disagreement ? ["Current-role sources disagree."] : [])
    ];

    return {
      playerId: player.id,
      name: playerName(player),
      selected: selectedIds.has(player.id),
      ...classification,
      dimensions: grouped,
      warnings
    };
  });
  const selectedItems = items.filter((item) => item.selected);
  const missing = adapterStatuses.filter((adapter) => adapter.status === "missing");
  const failed = adapterStatuses.filter((adapter) => adapter.status === "failed");

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    policy: { currentHalfLifeDays: 14, historicalHalfLifeDays: 60, historicalOnlyConfidenceCap: 0.45 },
    adapters: adapterStatuses,
    summary: {
      playersReviewed: items.length,
      selectedPlayers: selectedItems.length,
      ready: selectedItems.filter((item) => item.status === "READY").length,
      caution: selectedItems.filter((item) => item.status === "CAUTION").length,
      insufficient: selectedItems.filter((item) => item.status === "INSUFFICIENT").length,
      disagreements: selectedItems.filter((item) => item.disagreement).length,
      missingAdapters: missing.length,
      failedAdapters: failed.length
    },
    items: selectedItems.length > 0 ? selectedItems : items,
    warnings: [
      ...missing.map((adapter) => `${adapter.provider} ${adapter.kind} adapter is missing reviewed input.`),
      ...failed.map((adapter) => `${adapter.provider} ${adapter.kind} adapter failed: ${adapter.message}`),
      ...selectedItems.filter((item) => item.status === "INSUFFICIENT").map((item) => `${item.name} has INSUFFICIENT current-role evidence.`)
    ]
  };
}

export function renderCurrentRoleReportMarkdown(report: CurrentRoleReport) {
  return `# Current Role Report: GW${report.gameweek}

Generated: ${report.generatedAt}

## Summary

- Players reviewed: ${report.summary.playersReviewed}
- Selected players: ${report.summary.selectedPlayers}
- READY: ${report.summary.ready}
- CAUTION: ${report.summary.caution}
- INSUFFICIENT: ${report.summary.insufficient}
- Source disagreements: ${report.summary.disagreements}
- Missing adapters: ${report.summary.missingAdapters}
- Failed adapters: ${report.summary.failedAdapters}

## Players

| Player | Status | Support | Confidence | Current evidence | Disagreement | Override |
| --- | --- | ---: | ---: | --- | --- | --- |
${report.items.map((item) => `| ${item.name} | ${item.status} | ${item.supportScore.toFixed(3)} | ${item.confidence.toFixed(3)} | ${item.currentEvidencePresent ? "yes" : "no"} | ${item.disagreement ? "yes" : "no"} | ${item.manualOverride ?? "none"} |`).join("\n") || "| None | n/a | n/a | n/a | n/a | n/a | n/a |"}

## Adapter Coverage

${report.adapters.map((adapter) => `- ${adapter.id} (${adapter.kind}, ${adapter.provider}): ${adapter.status} - ${adapter.message}`).join("\n") || "- None"}

## Warnings

${report.warnings.map((warning) => `- ${warning}`).join("\n") || "- None"}
`;
}
