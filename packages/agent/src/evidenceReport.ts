import type {
  EvidenceConfidence,
  EvidenceFreshness,
  EvidenceItem,
  EvidenceReport,
  EvidenceSource
} from "./types";

type EvidenceSourceInput = {
  id: string;
  label: string;
  provider: string;
  url?: string | null;
  rawPath?: string | null;
  reportPath?: string | null;
  required?: boolean;
  confidence?: EvidenceConfidence;
  fetchedAt?: string | null;
  maxAgeHours?: number;
  missingMessage?: string;
  staleMessage?: string;
};

type BuildEvidenceReportInput = {
  generatedAt: string;
  gameweek: number;
  sources: EvidenceSourceInput[];
  items?: EvidenceItem[];
};

function hoursBetween(start: string, end: string) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }

  return Number(((endMs - startMs) / 36e5).toFixed(1));
}

function buildFreshness(input: EvidenceSourceInput, checkedAt: string): EvidenceFreshness {
  const maxAgeHours = input.maxAgeHours ?? 24;

  if (!input.fetchedAt) {
    return {
      status: "missing",
      checkedAt,
      fetchedAt: null,
      ageHours: null,
      maxAgeHours,
      message: input.missingMessage ?? `${input.label} evidence is missing.`
    };
  }

  const ageHours = hoursBetween(input.fetchedAt, checkedAt);

  if (ageHours === null || ageHours > maxAgeHours) {
    return {
      status: "stale",
      checkedAt,
      fetchedAt: input.fetchedAt,
      ageHours,
      maxAgeHours,
      message: input.staleMessage ?? `${input.label} evidence is stale.`
    };
  }

  return {
    status: "fresh",
    checkedAt,
    fetchedAt: input.fetchedAt,
    ageHours,
    maxAgeHours,
    message: `${input.label} is fresh.`
  };
}

function buildSource(input: EvidenceSourceInput, checkedAt: string): EvidenceSource {
  return {
    id: input.id,
    label: input.label,
    provider: input.provider,
    url: input.url ?? null,
    rawPath: input.rawPath ?? null,
    reportPath: input.reportPath ?? null,
    required: input.required ?? true,
    confidence: input.confidence ?? "medium",
    freshness: buildFreshness(input, checkedAt)
  };
}

function defaultItem(source: EvidenceSource): EvidenceItem {
  return {
    sourceId: source.id,
    area: source.id,
    subject: source.label,
    severity: source.freshness.status === "missing" ? "missing" : source.freshness.status === "stale" ? "watch" : "info",
    summary: source.freshness.message,
    confidence: source.confidence,
    fetchedAt: source.freshness.fetchedAt,
    url: source.url
  };
}

export function buildEvidenceReport(input: BuildEvidenceReportInput): EvidenceReport {
  const sources = input.sources.map((source) => buildSource(source, input.generatedAt));
  const items = input.items ?? sources.map(defaultItem);
  const warnings = sources
    .filter((source) => source.required && source.freshness.status !== "fresh")
    .map((source) => source.freshness.message);

  return {
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    summary: {
      fresh: sources.filter((source) => source.freshness.status === "fresh").length,
      stale: sources.filter((source) => source.freshness.status === "stale").length,
      missing: sources.filter((source) => source.freshness.status === "missing").length,
      requiredMissing: sources.filter((source) => source.required && source.freshness.status === "missing").length,
      requiredStale: sources.filter((source) => source.required && source.freshness.status === "stale").length
    },
    sources,
    items,
    warnings
  };
}

export function renderEvidenceReportMarkdown(report: EvidenceReport) {
  return `# Evidence Report: GW${report.gameweek}

Generated: ${report.generatedAt}

## Summary

- Fresh sources: ${report.summary.fresh}
- Stale sources: ${report.summary.stale}
- Missing sources: ${report.summary.missing}
- Required missing: ${report.summary.requiredMissing}
- Required stale: ${report.summary.requiredStale}

## Sources

| Source | Provider | Status | Confidence | Fetched | Max age |
| --- | --- | --- | --- | --- | ---: |
${report.sources.map((source) => `| ${source.label} | ${source.provider} | ${source.freshness.status} | ${source.confidence} | ${source.freshness.fetchedAt ?? "missing"} | ${source.freshness.maxAgeHours}h |`).join("\n")}

## Evidence Items

${report.items.map((item) => `- ${item.area}: ${item.severity} - ${item.summary}`).join("\n") || "- None"}

## Warnings

${report.warnings.map((warning) => `- ${warning}`).join("\n") || "- None"}
`;
}
