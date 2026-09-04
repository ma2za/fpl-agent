import type {
  AdapterHealthMetrics,
  CurrentRoleItem,
  CurrentRoleReport,
  NormalizedRoleEvidence,
  RoleAssessmentDimension,
  RoleDimensionAssessment,
  RoleEvidenceAdapterInput,
  RoleEvidenceAdapterKind,
  RoleEvidenceDimension,
  RoleEvidenceRecord,
  RoleObservation,
  RootEvidenceSource
} from "./types";

const dimensions: RoleEvidenceDimension[] = [
  "historical_availability", "historical_starts", "current_manager_preference", "preseason_start_rate",
  "predicted_lineup_consensus", "injury_status", "squad_competition", "transfer_risk",
  "substitution_patterns", "set_piece_roles"
];
const assessmentDimensions: RoleAssessmentDimension[] = [
  "historicalRole", "currentManagerPreference", "preseasonUsage", "predictedLineupConsensus",
  "availability", "squadCompetition", "transferRisk", "setPieceRole"
];
const assessmentInputs: Record<RoleAssessmentDimension, RoleEvidenceDimension[]> = {
  historicalRole: ["historical_starts", "substitution_patterns"],
  currentManagerPreference: ["current_manager_preference"],
  preseasonUsage: ["preseason_start_rate"],
  predictedLineupConsensus: ["predicted_lineup_consensus"],
  availability: ["historical_availability", "injury_status"],
  squadCompetition: ["squad_competition"],
  transferRisk: ["transfer_risk"],
  setPieceRole: ["set_piece_roles"]
};
const weights: Record<RoleEvidenceAdapterKind | "previous_season_starts" | "historical_minutes" | "current_season_minutes", number> = {
  official_availability: 0.9,
  manager_confirmation: 0.95,
  official_club: 0.9,
  preseason_lineup: 0.65,
  predicted_lineup: 0.75,
  substitution_events: 0.8,
  transfer_reporting: 0.7,
  bookmaker_market: 0.8,
  reviewed_manual: 1,
  previous_season_starts: 0.45,
  historical_minutes: 0.3,
  current_season_minutes: 0.85
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

function uniqueById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function normalizeRecord(
  record: RoleEvidenceRecord,
  sourceId: string,
  provider: string,
  sourceKind: NormalizedRoleEvidence["sourceKind"],
  reliability: number,
  generatedAt: string,
  observations: Map<string, RoleObservation> = new Map(),
  sources: Map<string, RootEvidenceSource> = new Map()
): NormalizedRoleEvidence {
  const ageDays = Math.max(0, (Date.parse(generatedAt) - Date.parse(record.observedAt)) / 86_400_000);
  const historical = sourceKind === "previous_season_starts" || sourceKind === "historical_minutes";
  const observationIds = record.observationIds ?? [];
  const rootObservations = observationIds.flatMap((id) => observations.get(id) ? [observations.get(id)!] : []);
  const rootSourceIds = [...new Set(rootObservations.flatMap((observation) => observation.sourceIds))];
  const independentClaims = new Set(rootObservations.flatMap((observation) => observation.sourceIds.map((rootId) => {
    const publisher = sources.get(rootId)?.publisher ?? rootId;
    return `${publisher}\u0000${observation.underlyingClaimId}`;
  })));
  const evidenceWeight = (record.sourceReliability ?? 1) *
    (record.credibility?.score ?? 1) *
    (record.relevance?.score ?? 1);

  return {
    ...record,
    sourceId,
    provider,
    sourceKind,
    rootSourceIds,
    observationIds,
    independentSourceCount: independentClaims.size,
    baseWeight: weights[sourceKind],
    effectiveWeight: Number((weights[sourceKind] * reliability * evidenceWeight * decay(ageDays, historical ? 60 : 14)).toFixed(4)),
    ageDays: Number(ageDays.toFixed(2))
  };
}

function historicalRecords(player: RolePlayer, generatedAt: string, gameweek: number) {
  const records: NormalizedRoleEvidence[] = [];
  const historicalObservedAt = player.historical_observed_at ?? generatedAt;

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

  if (gameweek > 1 && typeof player.minutes === "number") {
    const completedGameweeks = gameweek - 1;
    const minutesPerGameweek = player.minutes / completedGameweeks;
    const startRate = typeof player.starts === "number"
      ? player.starts / completedGameweeks
      : null;
    records.push(normalizeRecord({
      playerId: player.id,
      dimension: "current_manager_preference",
      signal: startRate !== null
        ? startRate >= 0.75 ? "supports_start" : startRate <= 0.25 ? "opposes_start" : "neutral"
        : minutesPerGameweek >= 60 ? "supports_start" : minutesPerGameweek < 20 ? "opposes_start" : "neutral",
      value: startRate === null ? Number(minutesPerGameweek.toFixed(1)) : Number(startRate.toFixed(3)),
      observedAt: historicalObservedAt,
      sourceReliability: Math.min(1, completedGameweeks / 2),
      note: startRate === null
        ? `${player.minutes} minutes across ${completedGameweeks} completed gameweek(s).`
        : `${player.starts} starts and ${player.minutes} minutes across ${completedGameweeks} completed gameweek(s).`
    }, "current-season-minutes", "Fantasy Premier League current-season history", "current_season_minutes", 1, generatedAt));
  } else if (typeof player.minutes === "number" && player.minutes > 0) {
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
  const positiveWeight = directional.filter((record) => record.signal === "supports_start")
    .reduce((sum, record) => sum + record.effectiveWeight, 0);
  const negativeWeight = directional.filter((record) => record.signal === "opposes_start")
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

function assessDimension(
  dimension: RoleAssessmentDimension,
  records: NormalizedRoleEvidence[],
  sources: Map<string, RootEvidenceSource>,
  observations: Map<string, RoleObservation>
): RoleDimensionAssessment {
  const relevant = records.filter((record) => assessmentInputs[dimension].includes(record.dimension));
  const current = relevant.filter((record) => record.observationIds.length > 0);
  const supportsStart = relevant.some((record) => record.signal === "supports_start");
  const opposesStart = relevant.some((record) => record.signal === "opposes_start");
  const conflicting = current.length > 0 && supportsStart && opposesStart;
  const historicalOnly = dimension === "historicalRole" && current.length === 0 && relevant.length > 0;
  const coverage = conflicting ? "conflicting" : current.length > 0 ? "current" : historicalOnly ? "historical_only" : "missing";
  const observationIds = [...new Set(current.flatMap((record) => record.observationIds))];
  const publishers = [...new Set(observationIds.flatMap((id) =>
    (observations.get(id)?.sourceIds ?? []).flatMap((sourceId) => sources.get(sourceId)?.publisher ?? [])
  ))].sort();
  const independentSources = new Set(observationIds.flatMap((id) => {
    const observation = observations.get(id);
    return observation?.sourceIds.map((sourceId) =>
      `${sources.get(sourceId)?.publisher ?? sourceId}\u0000${observation.underlyingClaimId}`
    ) ?? [];
  }));
  const rawConfidence = relevant.reduce((sum, record) => sum + record.effectiveWeight, 0);
  const evidenceConfidence = coverage === "missing" ? 0 : Math.min(historicalOnly ? 0.45 : 1, rawConfidence);
  const reasonCodes: RoleDimensionAssessment["reasonCodes"] = coverage === "conflicting"
    ? ["conflicting_sources"]
    : coverage === "current"
      ? ["current_sources"]
      : coverage === "historical_only"
        ? ["historical_only"]
        : ["no_coverage"];

  return {
    dimension,
    coverage,
    evidenceConfidence: Number(evidenceConfidence.toFixed(3)),
    estimatedStartProbability: null,
    observationIds,
    publishers,
    independentSourceCount: independentSources.size,
    supportsStart,
    opposesStart,
    reasonCodes
  };
}

function metrics(input: RoleEvidenceAdapterInput, generatedAt: string): AdapterHealthMetrics {
  const stale = input.observations?.filter((observation) =>
    Date.parse(generatedAt) - Date.parse(observation.observedAt) > 14 * 86_400_000
  ).length ?? 0;
  return {
    configured: input.coverage?.configured ?? 1,
    fetched: input.coverage?.fetched ?? input.observations?.length ?? 0,
    parsed: input.coverage?.parsed ?? input.observations?.length ?? 0,
    matched: input.coverage?.matched ?? input.records?.length ?? 0,
    stale: input.coverage?.stale ?? stale,
    failed: input.coverage?.failed ?? (input.error ? 1 : 0),
    unsupported: input.coverage?.unsupported ?? 0
  };
}

export function buildCurrentRoleReport(input: BuildCurrentRoleReportInput): CurrentRoleReport {
  const sources = uniqueById(input.adapters.flatMap((adapter) => adapter.sources ?? []));
  const observations = uniqueById(input.adapters.flatMap((adapter) => adapter.observations ?? []));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const observationById = new Map(observations.map((observation) => [observation.id, observation]));

  for (const adapter of input.adapters) {
    for (const record of adapter.records ?? []) {
      if (!record.observationIds?.length) {
        throw new Error(`Non-historical role record for player ${record.playerId} from ${adapter.config.id} has no root observation.`);
      }
      for (const id of record.observationIds) {
        const observation = observationById.get(id);
        if (!observation) throw new Error(`Role record for player ${record.playerId} references missing observation ${id}.`);
        for (const sourceId of observation.sourceIds) {
          if (!sourceById.has(sourceId)) throw new Error(`Role observation ${id} references missing root source ${sourceId}.`);
        }
      }
    }
  }

  const adapterStatuses = input.adapters.map((adapter) => {
    const adapterMetrics = metrics(adapter, input.generatedAt);
    const status = !adapter.config.enabled
      ? "disabled"
      : adapter.error
        ? "failed"
        : adapterMetrics.unsupported > 0 && !adapter.records?.length
          ? "unsupported"
          : adapter.records
            ? "loaded"
            : "missing";
    return {
      id: adapter.config.id,
      kind: adapter.config.kind,
      provider: adapter.config.provider,
      status,
      recordCount: adapter.records?.length ?? 0,
      metrics: adapterMetrics,
      message: !adapter.config.enabled
        ? "Adapter is disabled."
        : adapter.error ?? (status === "unsupported"
          ? "Adapter reports unsupported source coverage."
          : adapter.records ? `Loaded ${adapter.records.length} records.` : "Adapter has no coding-agent-reviewed input.")
    } as const;
  });
  const totals = adapterStatuses.reduce((total, adapter) => {
    for (const key of Object.keys(total) as Array<keyof AdapterHealthMetrics>) total[key] += adapter.metrics[key];
    return total;
  }, { configured: 0, fetched: 0, parsed: 0, matched: 0, stale: 0, failed: 0, unsupported: 0 });
  const coverageAdapters = adapterStatuses.map(({ recordCount: _recordCount, ...adapter }) => adapter);
  const adapterRecords = input.adapters.flatMap((adapter) =>
    !adapter.config.enabled || !adapter.records ? [] : adapter.records.map((record) => normalizeRecord(
      record,
      adapter.config.id,
      adapter.config.provider,
      adapter.config.kind,
      adapter.config.reliability,
      input.generatedAt,
      observationById,
      sourceById
    ))
  );
  const selectedIds = new Set(input.selectedPlayerIds ?? []);
  const items = input.players.map((player): CurrentRoleItem => {
    const records = [...historicalRecords(player, input.generatedAt, input.gameweek), ...adapterRecords.filter((record) => record.playerId === player.id)];
    const grouped = emptyDimensions();
    for (const record of records) grouped[record.dimension].push(record);
    const assessments = Object.fromEntries(assessmentDimensions.map((dimension) => [
      dimension,
      assessDimension(dimension, records, sourceById, observationById)
    ])) as CurrentRoleItem["assessments"];
    const classification = classify(records);
    const conflictingDimensions = assessmentDimensions.filter((dimension) => assessments[dimension].coverage === "conflicting");
    const disagreement = conflictingDimensions.length > 0;
    const warnings = [
      ...(!classification.currentEvidencePresent ? ["No current-role evidence is present; historical evidence cannot produce READY."] : []),
      ...conflictingDimensions.map((dimension) => `Current-role sources disagree for ${dimension}.`)
    ];

    return {
      playerId: player.id,
      name: playerName(player),
      selected: selectedIds.has(player.id),
      ...classification,
      disagreement,
      dimensions: grouped,
      assessments,
      warnings
    };
  });
  const selectedItems = items.filter((item) => item.selected);
  const missing = adapterStatuses.filter((adapter) => adapter.status === "missing" || adapter.status === "unsupported");
  const failed = adapterStatuses.filter((adapter) => adapter.status === "failed");

  return {
    schemaVersion: 2,
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    sources,
    observations,
    transformations: [{
      id: `tx:current-role-gw-${input.gameweek}`,
      tool: "current-role-report",
      toolVersion: "0.0.12",
      inputObservationIds: observations.map((observation) => observation.id),
      outputPlayerIds: items.map((item) => item.playerId)
    }],
    adapterCoverage: { schemaVersion: 1, generatedAt: input.generatedAt, adapters: coverageAdapters, totals },
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
    items,
    warnings: [
      ...missing.map((adapter) => `${adapter.provider} ${adapter.kind} adapter is missing or unsupported.`),
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

## Dimension Coverage

${report.items.flatMap((item) => assessmentDimensions.map((dimension) => {
    const assessment = item.assessments[dimension];
    return `- ${item.name} ${dimension}: ${assessment.coverage}, confidence ${assessment.evidenceConfidence.toFixed(3)}, publishers ${assessment.publishers.join(", ") || "none"}.`;
  })).join("\n") || "- None"}

## Adapter Coverage

${report.adapters.map((adapter) => `- ${adapter.id} (${adapter.kind}, ${adapter.provider}): ${adapter.status} - configured ${adapter.metrics.configured}, fetched ${adapter.metrics.fetched}, parsed ${adapter.metrics.parsed}, matched ${adapter.metrics.matched}, stale ${adapter.metrics.stale}, failed ${adapter.metrics.failed}, unsupported ${adapter.metrics.unsupported}. ${adapter.message}`).join("\n") || "- None"}

## Warnings

${report.warnings.map((warning) => `- ${warning}`).join("\n") || "- None"}
`;
}
