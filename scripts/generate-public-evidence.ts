import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildPublicEvidenceReport,
  renderPublicEvidenceReportMarkdown,
  type PublicEvidenceCaptureMode,
  type PublicEvidencePage,
  type PublicEvidenceSourceConfig
} from "../packages/agent/src";

type BrowserModule = {
  chromium: {
    launch: (options: { headless: boolean }) => Promise<{
      newContext: (options: { userAgent: string; locale: string }) => Promise<{
        newPage: () => Promise<{
          goto: (url: string, options: { waitUntil: "domcontentloaded"; timeout: number }) => Promise<unknown>;
          waitForLoadState: (state: "networkidle", options: { timeout: number }) => Promise<unknown>;
          title: () => Promise<string>;
          locator: (selector: string) => {
            innerText: (options: { timeout: number }) => Promise<string>;
          };
        }>;
        close: () => Promise<void>;
      }>;
      close: () => Promise<void>;
    }>;
  };
};

export const defaultPublicEvidenceSources: PublicEvidenceSourceConfig[] = [
  {
    id: "premier-league-matches",
    label: "Premier League matches",
    provider: "PremierLeague.com",
    url: "https://www.premierleague.com/en/matches",
    area: "fixtures",
    required: true,
    confidence: "high"
  },
  {
    id: "fpl-scout-player-news",
    label: "FPL Scout player news",
    provider: "Fantasy Premier League",
    url: "https://fantasy.premierleague.com/the-scout/player-news",
    area: "player-news",
    required: true,
    confidence: "high"
  },
  {
    id: "ffscout-team-news",
    label: "Fantasy Football Scout team news",
    provider: "Fantasy Football Scout",
    url: "https://www.fantasyfootballscout.co.uk/team-news",
    area: "predicted-lineups",
    required: false,
    confidence: "medium"
  },
  {
    id: "rotowire-lineups",
    label: "RotoWire lineups",
    provider: "RotoWire",
    url: "https://www.rotowire.com/soccer/lineups.php",
    area: "predicted-lineups",
    required: false,
    confidence: "medium"
  },
  {
    id: "fplwatch-price-changes",
    label: "FPLWatch price changes",
    provider: "FPLWatch",
    url: "https://fplwatch.com/price-changes",
    area: "prices",
    required: false,
    confidence: "medium"
  }
];

function argValue(name: string) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function argValues(name: string) {
  return process.argv.flatMap((arg, index) => (arg === name && process.argv[index + 1] ? [process.argv[index + 1]] : []));
}

function usage() {
  return "Usage: pnpm public-evidence -- --gw <gameweek> [--source-url <url>] [--mode auto|browser|fetch]";
}

function excerpt(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 4000);
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"");
}

function titleFromHtml(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function sourcesFromArgs() {
  const sourceUrls = argValues("--source-url");

  if (sourceUrls.length === 0) {
    return defaultPublicEvidenceSources;
  }

  return sourceUrls.map((url, index): PublicEvidenceSourceConfig => ({
    id: `custom-${index + 1}`,
    label: `Custom public source ${index + 1}`,
    provider: new URL(url).hostname,
    url,
    area: "general-news",
    required: false,
    confidence: "medium"
  }));
}

async function loadBrowser() {
  return import("playwright") as Promise<BrowserModule>;
}

async function captureWithFetch(
  source: PublicEvidenceSourceConfig,
  rawDir: string,
  fetchImpl: typeof fetch
): Promise<PublicEvidencePage> {
  const response = await fetchImpl(source.url, {
    headers: {
      accept: "text/html,text/plain,*/*",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "fpl-agent public evidence"
    }
  });

  if (!response.ok) {
    throw new Error(`${source.provider} returned ${response.status} for ${source.url}`);
  }

  const html = await response.text();
  const text = stripHtml(html);
  const capturedAt = new Date().toISOString();
  const rawPath = path.join(rawDir, `${source.id}.txt`);

  await writeFile(rawPath, text, "utf8");

  return {
    sourceId: source.id,
    label: source.label,
    provider: source.provider,
    url: source.url,
    area: source.area,
    capturedAt,
    captureMode: "fetch",
    title: titleFromHtml(html),
    textExcerpt: excerpt(text),
    wordCount: wordCount(text),
    rawPath,
    error: null,
    confidence: source.confidence
  };
}

async function captureWithBrowser(source: PublicEvidenceSourceConfig, rawDir: string, browserModule: BrowserModule): Promise<PublicEvidencePage> {
  const browser = await browserModule.chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "fpl-agent public evidence",
    locale: "en-US"
  });

  try {
    const page = await context.newPage();

    await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);

    const title = await page.title();
    const text = await page.locator("body").innerText({ timeout: 10000 });
    const capturedAt = new Date().toISOString();
    const rawPath = path.join(rawDir, `${source.id}.txt`);

    await writeFile(rawPath, text, "utf8");

    return {
      sourceId: source.id,
      label: source.label,
      provider: source.provider,
      url: source.url,
      area: source.area,
      capturedAt,
      captureMode: "playwright",
      title,
      textExcerpt: excerpt(text),
      wordCount: wordCount(text),
      rawPath,
      error: null,
      confidence: source.confidence
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

function failedPage(source: PublicEvidenceSourceConfig, error: unknown): PublicEvidencePage {
  return {
    sourceId: source.id,
    label: source.label,
    provider: source.provider,
    url: source.url,
    area: source.area,
    capturedAt: new Date().toISOString(),
    captureMode: "failed",
    title: null,
    textExcerpt: "",
    wordCount: 0,
    rawPath: null,
    error: error instanceof Error ? error.message : String(error),
    confidence: "low"
  };
}

async function captureFromCache(source: PublicEvidenceSourceConfig, rawDir: string): Promise<PublicEvidencePage> {
  const rawPath = path.join(rawDir, `${source.id}.txt`);
  const [text, file] = await Promise.all([readFile(rawPath, "utf8"), stat(rawPath)]);

  return {
    sourceId: source.id,
    label: source.label,
    provider: source.provider,
    url: source.url,
    area: source.area,
    capturedAt: file.mtime.toISOString(),
    captureMode: "fetch",
    title: null,
    textExcerpt: excerpt(text),
    wordCount: wordCount(text),
    rawPath,
    error: null,
    confidence: source.confidence
  };
}

async function captureSource(
  source: PublicEvidenceSourceConfig,
  rawDir: string,
  mode: "auto" | "browser" | "fetch",
  browserModule: BrowserModule | null,
  fetchImpl: typeof fetch
) {
  if (mode !== "fetch" && browserModule) {
    return captureWithBrowser(source, rawDir, browserModule);
  }

  if (mode === "browser") {
    throw new Error("Playwright is not installed or could not launch Chromium.");
  }

  return captureWithFetch(source, rawDir, fetchImpl);
}

export async function generatePublicEvidence(input: {
  gameweek: number;
  outputDir?: string;
  rawDir?: string;
  logicalRawDir?: string;
  sources?: PublicEvidenceSourceConfig[];
  mode?: "auto" | "browser" | "fetch";
  offline?: boolean;
  generatedAt?: string;
  log?: boolean;
  fetchImpl?: typeof fetch;
}) {
  const gameweek = input.gameweek;
  const mode = input.mode ?? "auto";

  if (!Number.isInteger(gameweek) || gameweek < 1 || !["auto", "browser", "fetch"].includes(mode)) {
    throw new Error(usage());
  }

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const outputDir = input.outputDir ?? path.join("packages", "content", "recommendations", `gw-${gameweek}`);
  const rawDir = input.rawDir ?? path.join(outputDir, "raw-sources", "public-evidence");
  const logicalRawDir = input.logicalRawDir ?? rawDir;
  const sources = input.sources ?? defaultPublicEvidenceSources;
  const browserModule = input.offline || mode === "fetch" ? null : await loadBrowser().catch(() => null);
  const pages: PublicEvidencePage[] = [];

  await mkdir(rawDir, { recursive: true });

  for (const source of sources) {
    try {
      pages.push(input.offline
        ? await captureFromCache(source, rawDir)
        : await captureSource(source, rawDir, mode, browserModule, input.fetchImpl ?? fetch));
    } catch (error) {
      pages.push(failedPage(source, error));
    }
  }

  const report = buildPublicEvidenceReport({
    generatedAt,
    gameweek,
    sources,
    pages: pages.map((page) => page.rawPath
      ? { ...page, rawPath: path.join(logicalRawDir, path.basename(page.rawPath)) }
      : page)
  });

  await writeFile(path.join(outputDir, "public-evidence-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "public-evidence-report.md"), renderPublicEvidenceReportMarkdown(report), "utf8");
  if (input.log ?? true) {
    console.log(
      `Wrote public evidence report to ${outputDir}: ${report.summary.capturedPages}/${report.summary.configuredSources} pages captured.`
    );
  }

  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gameweek = Number(argValue("--gw") ?? 1);
  const mode = argValue("--mode") ?? "auto";

  if (!Number.isInteger(gameweek) || gameweek < 1 || !["auto", "browser", "fetch"].includes(mode)) {
    console.error(usage());
    process.exitCode = 1;
  } else {
    generatePublicEvidence({
      gameweek,
      mode: mode as "auto" | "browser" | "fetch",
      sources: sourcesFromArgs()
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
