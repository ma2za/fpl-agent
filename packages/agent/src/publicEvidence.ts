import type {
  PublicEvidencePage,
  PublicEvidenceReport,
  PublicEvidenceSignal,
  PublicEvidenceSourceConfig
} from "./types";

type BuildPublicEvidenceReportInput = {
  generatedAt: string;
  gameweek: number;
  sources: PublicEvidenceSourceConfig[];
  pages: PublicEvidencePage[];
};

const riskPatterns = [
  /\binjured\b/i,
  /\bdoubt(?:ful)?\b/i,
  /\bsuspended\b/i,
  /\bruled out\b/i,
  /\bout:\s+\S/i,
  /\bbanned:\s+\S/i,
  /\bhamstring\b/i,
  /\bknock\b/i,
  /\bunavailable\b/i
];

const watchPatterns = [
  /\bteam news\b/i,
  /\bpredicted line-?ups?\b/i,
  /\bline-?ups?\b/i,
  /\bpress conference\b/i,
  /\bfitness\b/i,
  /\bprice changes?\b/i,
  /\btransfers?\b/i
];

function compact(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function sentenceWith(text: string, patterns: RegExp[]) {
  const sentences = compact(text).split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length <= 320);

  return sentences.find((sentence) => patterns.some((pattern) => pattern.test(sentence))) ?? null;
}

function buildSignal(page: PublicEvidencePage): PublicEvidenceSignal {
  if (page.captureMode === "failed") {
    return {
      sourceId: page.sourceId,
      area: page.area,
      severity: "missing",
      subject: page.label,
      summary: page.error ?? `${page.label} could not be captured.`,
      url: page.url,
      confidence: "low"
    };
  }

  const riskSentence = sentenceWith(page.textExcerpt, riskPatterns);

  if (riskSentence) {
    return {
      sourceId: page.sourceId,
      area: page.area,
      severity: "risk",
      subject: page.title ?? page.label,
      summary: riskSentence,
      url: page.url,
      confidence: page.confidence
    };
  }

  const watchSentence = sentenceWith(page.textExcerpt, watchPatterns);

  return {
    sourceId: page.sourceId,
    area: page.area,
    severity: watchSentence ? "watch" : "info",
    subject: page.title ?? page.label,
    summary: watchSentence ?? `${page.label} captured ${page.wordCount} words of public evidence.`,
    url: page.url,
    confidence: page.confidence
  };
}

export function buildPublicEvidenceReport(input: BuildPublicEvidenceReportInput): PublicEvidenceReport {
  const pageBySource = new Map(input.pages.map((page) => [page.sourceId, page]));
  const missingPages = input.sources
    .filter((source) => !pageBySource.has(source.id))
    .map((source): PublicEvidencePage => ({
      sourceId: source.id,
      label: source.label,
      provider: source.provider,
      url: source.url,
      area: source.area,
      capturedAt: input.generatedAt,
      captureMode: "failed",
      title: null,
      textExcerpt: "",
      wordCount: 0,
      rawPath: null,
      error: `${source.label} was configured but not captured.`,
      confidence: "low"
    }));
  const pages = [...input.pages, ...missingPages];
  const signals = pages.map(buildSignal);
  const warnings = [
    ...pages
      .filter((page) => page.captureMode === "failed")
      .map((page) => `${page.label} public evidence capture failed: ${page.error ?? "unknown error"}`),
    ...pages
      .filter((page) => page.captureMode !== "failed" && page.wordCount < 100)
      .map((page) => `${page.label} public evidence capture has low text coverage.`)
  ];

  return {
    generatedAt: input.generatedAt,
    gameweek: input.gameweek,
    summary: {
      configuredSources: input.sources.length,
      capturedPages: pages.filter((page) => page.captureMode !== "failed").length,
      failedPages: pages.filter((page) => page.captureMode === "failed").length,
      playwrightPages: pages.filter((page) => page.captureMode === "playwright").length,
      fetchPages: pages.filter((page) => page.captureMode === "fetch").length,
      signals: signals.length
    },
    pages,
    signals,
    warnings
  };
}

export function renderPublicEvidenceReportMarkdown(report: PublicEvidenceReport) {
  return `# Public Evidence Report: GW${report.gameweek}

Generated: ${report.generatedAt}

## Summary

- Configured sources: ${report.summary.configuredSources}
- Captured pages: ${report.summary.capturedPages}
- Failed pages: ${report.summary.failedPages}
- Playwright captures: ${report.summary.playwrightPages}
- Fetch captures: ${report.summary.fetchPages}
- Signals: ${report.summary.signals}

## Pages

| Source | Provider | Area | Mode | Words | URL |
| --- | --- | --- | --- | ---: | --- |
${report.pages.map((page) => `| ${page.label} | ${page.provider} | ${page.area} | ${page.captureMode} | ${page.wordCount} | ${page.url} |`).join("\n")}

## Signals

${report.signals.map((signal) => `- ${signal.area}: ${signal.severity} - ${signal.summary} (${signal.url})`).join("\n") || "- None"}

## Warnings

${report.warnings.map((warning) => `- ${warning}`).join("\n") || "- None"}
`;
}
