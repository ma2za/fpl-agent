import {
  DecisionStatusInputSchema,
  DecisionStatusReportSchema,
  EvidenceReadinessReportSchema,
  ProvisionalDecisionWorkspaceSchema,
  TriggerEvaluationReportSchema,
  TriggerPlanSchema,
  type DecisionStatusReport,
  type EvidenceReadinessReport,
  type PlayerDossier,
  type ProvisionalDecisionWorkspace,
  type TriggerEvaluation,
  type TriggerPlan
} from "./types";
import { stableId } from "./store";

export type ReadinessProjection = {
  playerId: number;
  startProbability: number;
  appearanceProbability: number;
  confidence: number;
  currentRoleEvidence: boolean;
};

export function buildEvidenceReadinessReport(input: {
  generatedAt: string;
  gameweek: number;
  dossiers: PlayerDossier[];
  projections: ReadinessProjection[];
  selectedPlayerIds?: number[];
}): EvidenceReadinessReport {
  const projections = new Map(input.projections.map((item) => [item.playerId, item]));
  const selected = new Set(input.selectedPlayerIds ?? []);
  const items = input.dossiers.map((dossier) => {
    const projection = projections.get(dossier.playerId) ?? {
      playerId: dossier.playerId, startProbability: 0, appearanceProbability: 0, confidence: 0, currentRoleEvidence: false
    };
    const officialSnapshot = dossier.snapshot !== null;
    const currentResearchCoverage = dossier.coverage?.status === "searched_with_results"
      || dossier.coverage?.status === "searched_zero_results";
    const historyAvailable = dossier.historyCoverage === "available";
    const ready = projection.startProbability >= 0.8 && projection.appearanceProbability >= 0.9
      && projection.confidence >= 0.7 && projection.currentRoleEvidence && officialSnapshot
      && currentResearchCoverage && historyAvailable;
    const caution = projection.startProbability >= 0.7 && projection.appearanceProbability >= 0.85
      && projection.confidence >= 0.55 && officialSnapshot && historyAvailable;
    const status = ready ? "READY" as const : caution ? "CAUTION" as const : "INSUFFICIENT" as const;
    return {
      playerId: dossier.playerId,
      name: dossier.snapshot?.name ?? `Player ${dossier.playerId}`,
      selected: selected.has(dossier.playerId),
      status,
      startProbability: projection.startProbability,
      appearanceProbability: projection.appearanceProbability,
      confidence: projection.confidence,
      currentRoleEvidence: projection.currentRoleEvidence,
      officialSnapshot,
      currentResearchCoverage,
      historyAvailable,
      reasonCodes: [
        ...(!officialSnapshot ? ["missing_official_snapshot"] : []),
        ...(!historyAvailable ? ["missing_player_history"] : []),
        ...(!currentResearchCoverage ? ["incomplete_research_coverage"] : []),
        ...(!projection.currentRoleEvidence ? ["missing_current_role_evidence"] : []),
        ...(projection.startProbability < 0.7 ? ["low_start_probability"] : []),
        ...(projection.appearanceProbability < 0.85 ? ["low_appearance_probability"] : []),
        ...(projection.confidence < 0.55 ? ["low_evidence_confidence"] : [])
      ]
    };
  });
  const selectedInsufficient = items.filter((item) => item.selected && item.status === "INSUFFICIENT");
  return EvidenceReadinessReportSchema.parse({
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    items,
    summary: {
      ready: items.filter((item) => item.status === "READY").length,
      caution: items.filter((item) => item.status === "CAUTION").length,
      insufficient: items.filter((item) => item.status === "INSUFFICIENT").length,
      selectedInsufficient: selectedInsufficient.length
    },
    warnings: selectedInsufficient.map((item) => `${item.name} has INSUFFICIENT longitudinal evidence readiness.`)
  });
}

export function buildDecisionStatusReport(input: {
  generatedAt: string;
  gameweek: number;
  value: unknown | null;
  readiness: EvidenceReadinessReport;
}): DecisionStatusReport {
  if (input.value === null) {
    return DecisionStatusReportSchema.parse({
      schemaVersion: 1, generatedAt: input.generatedAt, gameweek: input.gameweek, items: [],
      warnings: ["Agent decision-status input is missing."]
    });
  }
  const authored = DecisionStatusInputSchema.parse(input.value);
  if (authored.gameweek !== input.gameweek) throw new Error(`Decision-status input GW${authored.gameweek} does not match GW${input.gameweek}.`);
  const readiness = new Map(input.readiness.items.map((item) => [item.playerId, item.status]));
  const items = authored.items.map((item) => {
    const level = item.playerId === null ? "READY" as const : readiness.get(item.playerId) ?? "INSUFFICIENT" as const;
    const valid = level === "READY"
      || (level === "CAUTION" && item.status !== "LOCK")
      || (level === "INSUFFICIENT" && (item.status === "PROVISIONAL" || item.status === "AVOID"));
    return { ...item, readiness: level, valid };
  });
  return DecisionStatusReportSchema.parse({
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    items,
    warnings: items.filter((item) => !item.valid)
      .map((item) => `${item.decisionId} status ${item.status} is stronger than ${item.readiness} readiness permits.`)
  });
}

function compare(operator: TriggerPlan["triggers"][number]["operator"], current: string | number | boolean, threshold: string | number | boolean, previous: string | number | boolean | null) {
  if (operator === "changed") return previous !== null && current !== previous;
  if (operator === "eq") return current === threshold;
  if (operator === "neq") return current !== threshold;
  if (typeof current !== "number" || typeof threshold !== "number") return false;
  if (operator === "lt") return current < threshold;
  if (operator === "lte") return current <= threshold;
  if (operator === "gte") return current >= threshold;
  return current > threshold;
}

export function evaluateTriggerPlan(input: {
  generatedAt: string;
  gameweek: number;
  runId: string;
  value: unknown | null;
  metrics: Map<string, string | number | boolean>;
  previous: (triggerId: string) => TriggerEvaluation | null;
}) {
  if (input.value === null) {
    return TriggerEvaluationReportSchema.parse({
      schemaVersion: 1, generatedAt: input.generatedAt, gameweek: input.gameweek, evaluations: [],
      warnings: ["Agent trigger plan is missing."]
    });
  }
  const plan = TriggerPlanSchema.parse(input.value);
  if (plan.gameweek !== input.gameweek) throw new Error(`Trigger plan GW${plan.gameweek} does not match GW${input.gameweek}.`);
  const now = Date.parse(input.generatedAt);
  const evaluations = plan.triggers.map((trigger): TriggerEvaluation => {
    const key = `${trigger.metric}:${trigger.subject.kind}:${trigger.subject.id}`;
    const currentValue = input.metrics.get(key) ?? null;
    const previous = input.previous(trigger.triggerId);
    let state: TriggerEvaluation["state"];
    let reason: string;
    if (trigger.supersededByTriggerId) {
      state = "superseded"; reason = `Superseded by ${trigger.supersededByTriggerId}.`;
    } else if (now > Date.parse(trigger.expiresAt)) {
      state = "expired"; reason = "Trigger expiry has passed.";
    } else if (now < Date.parse(trigger.nextCheckAt) || currentValue === null) {
      state = "inactive"; reason = currentValue === null ? "Current metric is unavailable." : "Next check time has not arrived.";
    } else if (trigger.acknowledgedAt && previous?.state === "fired" && Date.parse(trigger.acknowledgedAt) >= Date.parse(previous.evaluatedAt)) {
      state = "acknowledged"; reason = "The coding agent acknowledged the prior fired trigger.";
    } else if (compare(trigger.operator, currentValue, trigger.threshold, previous?.currentValue ?? null)) {
      state = "fired"; reason = `Metric ${trigger.metric} satisfied ${trigger.operator} threshold.`;
    } else {
      state = "armed"; reason = `Metric ${trigger.metric} did not satisfy ${trigger.operator} threshold.`;
    }
    const core = { triggerId: trigger.triggerId, runId: input.runId, evaluatedAt: input.generatedAt, state, currentValue };
    return {
      evaluationId: stableId("trigger-evaluation", core),
      triggerId: trigger.triggerId,
      evaluatedAt: input.generatedAt,
      state,
      currentValue,
      previousValue: previous?.currentValue ?? null,
      evidenceDependencyIds: trigger.evidenceDependencyIds,
      affectedDecisionIds: trigger.affectedDecisionIds,
      candidateResponses: trigger.candidateResponses,
      reanalysisScope: trigger.reanalysisScope,
      reason
    };
  });
  return TriggerEvaluationReportSchema.parse({
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    evaluations,
    warnings: evaluations.filter((item) => item.state === "inactive" && item.currentValue === null)
      .map((item) => `${item.triggerId} could not be evaluated because its metric is unavailable.`)
  });
}

export function buildProvisionalDecisionWorkspace(input: {
  generatedAt: string;
  gameweek: number;
  readiness: EvidenceReadinessReport;
  decisionStatuses: DecisionStatusReport;
  triggers: { evaluations: TriggerEvaluation[] };
}): ProvisionalDecisionWorkspace | null {
  const affected = input.readiness.items.filter((item) => item.selected && item.status === "INSUFFICIENT");
  const invalidStatuses = input.decisionStatuses.items.filter((item) => !item.valid);
  const fired = input.triggers.evaluations.filter((item) => item.state === "fired");
  if (affected.length === 0 && invalidStatuses.length === 0 && fired.length === 0) return null;
  return ProvisionalDecisionWorkspaceSchema.parse({
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    status: "provisional",
    affectedPlayerIds: [...new Set([
      ...affected.map((item) => item.playerId),
      ...invalidStatuses.flatMap((item) => item.playerId === null ? [] : [item.playerId])
    ])].sort((a, b) => a - b),
    firedTriggerIds: fired.map((item) => item.triggerId).sort(),
    reasons: [
      ...affected.map((item) => `${item.name} has INSUFFICIENT readiness.`),
      ...invalidStatuses.map((item) => `${item.decisionId} has an unsupported ${item.status} status.`),
      ...fired.map((item) => `${item.triggerId} fired and requests agent re-analysis.`)
    ]
  });
}

export function renderReadinessMarkdown(report: EvidenceReadinessReport) {
  return `# Evidence Readiness: GW${report.gameweek}\n\nGenerated: ${report.generatedAt}\n\n| Player | Selected | Status | P(start) | P(appear) | Confidence | Research | History |\n| --- | --- | --- | ---: | ---: | ---: | --- | --- |\n${report.items.map((item) => `| ${item.name} | ${item.selected ? "yes" : "no"} | ${item.status} | ${item.startProbability.toFixed(3)} | ${item.appearanceProbability.toFixed(3)} | ${item.confidence.toFixed(3)} | ${item.currentResearchCoverage ? "complete" : "incomplete"} | ${item.historyAvailable ? "available" : "missing"} |`).join("\n")}\n\n## Warnings\n\n${report.warnings.map((item) => `- ${item}`).join("\n") || "- None"}\n`;
}

export function renderDecisionStatusMarkdown(report: DecisionStatusReport) {
  return `# Decision Status: GW${report.gameweek}\n\n${report.items.map((item) => `- ${item.decisionId}: ${item.status} (${item.readiness}) - ${item.valid ? "valid" : "invalid"}.`).join("\n") || "- No agent-authored statuses."}\n\n## Warnings\n\n${report.warnings.map((item) => `- ${item}`).join("\n") || "- None"}\n`;
}

export function renderTriggerEvaluationMarkdown(report: ReturnType<typeof evaluateTriggerPlan>) {
  return `# Trigger Evaluation: GW${report.gameweek}\n\n${report.evaluations.map((item) => `- ${item.triggerId}: ${item.state}. ${item.reason}`).join("\n") || "- No agent-authored triggers."}\n\n## Warnings\n\n${report.warnings.map((item) => `- ${item}`).join("\n") || "- None"}\n`;
}

export function renderPlayerDossierMarkdown(dossier: PlayerDossier) {
  return `# Player Dossier: ${dossier.snapshot?.name ?? dossier.playerId}\n\nDossier: ${dossier.dossierId}\n\nAs of: ${dossier.asOf}\n\n- History coverage: ${dossier.historyCoverage}\n- Research coverage: ${dossier.coverage?.status ?? "missing"}\n- Performance observations: ${dossier.performance.length}\n- Source documents: ${dossier.documents.length}\n- News observations: ${dossier.news.length}\n- Role observations: ${dossier.roleObservationIds.length}\n\n## Changes\n\n${dossier.changes.map((item) => `- ${item}`).join("\n") || "- None"}\n\n## Gaps\n\n${dossier.gaps.map((item) => `- ${item}`).join("\n") || "- None"}\n`;
}
