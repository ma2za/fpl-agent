import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PLAYER_NEWS_SOURCES, type PlayerNewsSource } from "../config/player-news-sources";
import {
  latestResearchWorklist,
  openPlayerStore,
  recordNewsDiscovery,
  updatePlayerStoreTransactionally
} from "../packages/player-store/src";

type WorklistPlayer = { playerId: number; name: string; webName: string; aliases: string[] };
type CrawledPage = { url: string; headline: string; text: string };
type GoogleNewsResult = {
  playerId: number;
  query: string;
  status: "completed" | "blocked";
  error: string | null;
  articles: Array<{ link: string; title: string; published: string; source: string | null }>;
};
type BrowserClient = {
  html: (url: string, waitForNetworkIdle: boolean) => Promise<string>;
  close: () => Promise<void>;
};
let browserTail = Promise.resolve();

export function searchGoogleNews(players: WorklistPlayer[], when = "14d", maxResults = 10) {
  return new Promise<{ provider: string; results: GoogleNewsResult[] }>((resolve, reject) => {
    const child = spawn("uv", ["run", "python", path.join("scripts", "google-news-player-search.py")], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `google-news-api exited with code ${code}.`));
      try {
        resolve(JSON.parse(stdout) as { provider: string; results: GoogleNewsResult[] });
      } catch {
        reject(new Error("google-news-api returned invalid JSON."));
      }
    });
    child.stdin.end(JSON.stringify({ players, when, maxResults }));
  });
}

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

export function visibleText(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&(?:nbsp|#160);/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();
}

export function articleText(html: string) {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  return visibleText(article ?? main ?? "");
}

export function linksFromHtml(html: string, baseUrl: string) {
  const links = new Map<string, string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(match[1], baseUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      url.hash = "";
      links.set(url.href, visibleText(match[2]));
    } catch {}
  }
  return [...links].map(([url, text]) => ({ url, text }));
}

export function linksFromDocument(content: string, baseUrl: string) {
  const links = new Map(linksFromHtml(content, baseUrl).map((link) => [link.url, link.text]));
  for (const item of content.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const urlValue = item[1].match(/<link\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim();
    const title = item[1].match(/<title\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1];
    if (!urlValue) continue;
    try {
      const url = new URL(urlValue, baseUrl);
      url.hash = "";
      links.set(url.href, visibleText(title ?? ""));
    } catch {}
  }
  return [...links].map(([url, text]) => ({ url, text }));
}

function headlineFromHtml(html: string) {
  const parts = [
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1],
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1],
    html.match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:title)["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1]
  ].filter((part): part is string => Boolean(part));
  return visibleText(parts.join(" "));
}

export function robotsAllows(text: string, pathname: string) {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let group = { agents: [] as string[], rules: [] as Array<{ allow: boolean; path: string }> };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#", 1)[0].trim();
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const key = field?.toLowerCase();
    if (key === "user-agent") {
      if (group.rules.length > 0) {
        groups.push(group);
        group = { agents: [], rules: [] };
      }
      group.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && group.agents.length > 0 && value) {
      group.rules.push({ allow: key === "allow", path: value });
    }
  }
  if (group.agents.length > 0) groups.push(group);
  const named = groups.filter((item) => item.agents.some((agent) => "fpl-agent-player-intelligence".startsWith(agent) && agent !== "*"));
  const applicable = named.length > 0 ? named : groups.filter((item) => item.agents.includes("*"));
  const matches = applicable.flatMap((item) => item.rules).filter((rule) => {
    const escaped = rule.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replace(/\\\$$/, "$");
    return new RegExp(`^${escaped}`).test(pathname);
  }).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return matches[0]?.allow ?? true;
}

async function fetchText(url: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, {
    headers: { accept: "text/html,text/plain;q=0.9,*/*;q=0.1", "accept-language": "en-GB,en;q=0.9", "user-agent": "fpl-agent-player-intelligence/0.0.17" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function loadBrowser(): Promise<BrowserClient> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: "fpl-agent-player-intelligence/0.0.17", locale: "en-GB" });
  return {
    html: async (url, waitForNetworkIdle) => {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        if (waitForNetworkIdle) await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
        return await page.content();
      } finally {
        await page.close();
      }
    },
    close: async () => {
      await context.close();
      await browser.close();
    }
  };
}

async function withBrowserSlot<T>(action: () => Promise<T>) {
  const previous = browserTail;
  let release = () => {};
  browserTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await action();
  } finally {
    release();
  }
}

async function acquireHtml(source: PlayerNewsSource, url: string, fetchImpl: typeof fetch, browser: BrowserClient | null) {
  if (source.strategy.acquisition === "browser") {
    if (!browser) throw new Error("Playwright is unavailable");
    return { html: await browser.html(url, source.strategy.waitForNetworkIdle), mode: "browser" as const };
  }
  try {
    return { html: await fetchText(url, fetchImpl), mode: "fetch" as const };
  } catch (error) {
    if (source.strategy.acquisition !== "fetch_then_browser" || !browser) throw error;
    return { html: await browser.html(url, source.strategy.waitForNetworkIdle), mode: "browser" as const };
  }
}

async function crawlSource(source: PlayerNewsSource, fetchImpl: typeof fetch, maxPages: number) {
  if (source.strategy.acquisition !== "fetch") {
    return withBrowserSlot(() => crawlSourceUnlocked(source, fetchImpl, maxPages));
  }
  return crawlSourceUnlocked(source, fetchImpl, maxPages);
}

async function crawlSourceUnlocked(source: PlayerNewsSource, fetchImpl: typeof fetch, maxPages: number) {
  let seedUrl = source.url;
  let sourceBrowser: BrowserClient | null = null;
  const origin = new URL(seedUrl).origin;
  let activeRobots = "";
  try {
    const robots = await fetchText(`${origin}/robots.txt`, fetchImpl).catch(() => "");
    activeRobots = robots;
    if (robots && !robotsAllows(robots, new URL(seedUrl).pathname)) {
      if (!source.strategy.fallbackUrl) return { source, status: "blocked" as const, pages: [], error: "robots.txt disallows the seed page", acquisitionUsed: null };
      seedUrl = source.strategy.fallbackUrl;
      const fallbackRobots = await fetchText(`${new URL(seedUrl).origin}/robots.txt`, fetchImpl).catch(() => "");
      if (fallbackRobots && !robotsAllows(fallbackRobots, new URL(seedUrl).pathname)) return { source, status: "blocked" as const, pages: [], error: "robots.txt disallows both seed and fallback pages", acquisitionUsed: null };
      activeRobots = fallbackRobots;
    }
    const useBrowser = source.strategy.acquisition !== "fetch";
    sourceBrowser = useBrowser ? await loadBrowser() : null;
    const seed = await acquireHtml(source, seedUrl, fetchImpl, sourceBrowser);
    const seedHtml = seed.html;
    const candidates = linksFromDocument(seedHtml, seedUrl)
      .filter((link) => new URL(link.url).origin === new URL(seedUrl).origin || seedUrl.endsWith(".xml"))
      .filter((link) => source.strategy.articlePathHints.some((hint) => `${link.url} ${link.text}`.toLocaleLowerCase().includes(hint)))
      .slice(0, Math.max(0, maxPages - 1));
    const pages = (await Promise.all(candidates.map(async (candidate): Promise<CrawledPage | null> => {
      if (activeRobots && new URL(candidate.url).origin === new URL(seedUrl).origin && !robotsAllows(activeRobots, new URL(candidate.url).pathname)) return null;
      try {
        const { html } = await acquireHtml(source, candidate.url, fetchImpl, sourceBrowser);
        return { url: candidate.url, headline: headlineFromHtml(html) || candidate.text, text: articleText(html) };
      } catch {
        return null;
      }
    }))).filter((page): page is CrawledPage => page !== null);
    await sourceBrowser?.close();
    sourceBrowser = null;
    return { source, status: "completed" as const, pages, error: null, acquisitionUsed: seed.mode };
  } catch (error) {
    await sourceBrowser?.close().catch(() => undefined);
    return { source, status: "blocked" as const, pages: [], error: error instanceof Error ? error.message : String(error), acquisitionUsed: null };
  }
}

function normalized(value: string) {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}

export function containsAlias(text: string, aliases: string[]) {
  const lower = normalized(text);
  return [...new Set(aliases)].sort((a, b) => b.length - a.length).some((alias) => {
    const candidate = normalized(alias).trim();
    if (candidate.length < 4) return false;
    return new RegExp(`(^|[^a-z0-9])${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(lower);
  });
}

function pageMatchesPlayer(page: CrawledPage, aliases: string[]) {
  const multiTokenAliases = aliases.filter((alias) => alias.trim().split(/\s+/).length > 1);
  return containsAlias(`${page.url} ${page.headline}`, aliases) || containsAlias(page.text, multiTokenAliases);
}

export async function discoverPlayerNews(input: {
  gameweek: number;
  minimumAppearanceProbability?: number;
  maxPagesPerSource?: number;
  concurrency?: number;
  sources?: PlayerNewsSource[];
  sourceIds?: string[];
  playerIds?: number[];
  fetchImpl?: typeof fetch;
  storePath?: string;
  googleNewsSearch?: typeof searchGoogleNews;
}) {
  const root = path.join("packages", "content", "recommendations", `gw-${input.gameweek}`);
  const storePath = input.storePath ?? path.join("data", "player-intelligence", "player-intelligence.sqlite");
  const db = openPlayerStore(storePath, { readonly: true });
  const worklist = latestResearchWorklist(db, input.gameweek);
  db.close();
  if (!worklist) throw new Error(`No evidence research worklist exists for GW${input.gameweek}; run pnpm refresh first.`);
  const projections = JSON.parse(await readFile(path.join(root, "probabilistic-projections.json"), "utf8")) as Array<{ playerId: number; appearance: { appearanceProbability: number } }>;
  const probability = new Map(projections.map((item) => [item.playerId, item.appearance.appearanceProbability]));
  const minimumAppearanceProbability = input.minimumAppearanceProbability ?? 0;
  const requestedPlayerIds = input.playerIds ? new Set(input.playerIds) : null;
  const players = worklist.players.filter((player) =>
    (probability.get(player.playerId) ?? 0) >= minimumAppearanceProbability &&
    (!requestedPlayerIds || requestedPlayerIds.has(player.playerId))
  );
  const configuredSources = input.sources ?? PLAYER_NEWS_SOURCES;
  const sources = input.sourceIds?.length ? configuredSources.filter((source) => input.sourceIds!.includes(source.id)) : configuredSources;
  const crawls = new Array<Awaited<ReturnType<typeof crawlSource>>>();
  let next = 0;
  await Promise.all(Array.from({ length: input.concurrency ?? 6 }, async () => {
    while (next < sources.length) {
      const source = sources[next++];
      crawls.push(await crawlSource(source, input.fetchImpl ?? fetch, input.maxPagesPerSource ?? 30));
    }
  }));
  const sourceOrder = new Map(sources.map((source, index) => [source.id, index]));
  crawls.sort((a, b) => sourceOrder.get(a.source.id)! - sourceOrder.get(b.source.id)!);
  const googleNews = await (input.googleNewsSearch ?? searchGoogleNews)(players);
  const googleByPlayer = new Map(googleNews.results.map((result) => [result.playerId, result]));
  const generatedAt = new Date().toISOString();
  const results = players.map((player) => {
    const google = googleByPlayer.get(player.playerId);
    return {
      playerId: player.playerId,
      name: player.name,
      searches: [...crawls.map((crawl) => {
        const pages = crawl.pages.filter((page) => pageMatchesPlayer(page, player.aliases));
        return {
          query: `${player.name} source crawl ${crawl.source.url}`,
          provider: `seed-crawl:${crawl.source.id}:${crawl.acquisitionUsed ?? crawl.source.strategy.acquisition}`,
          searchedAt: generatedAt,
          status: crawl.status,
          error: crawl.error,
          candidates: pages.map((page) => ({ url: page.url, title: page.headline, publisher: crawl.source.id, publishedAt: null }))
        };
      }), {
        query: google?.query ?? `${player.name} Premier League football`,
        provider: googleNews.provider,
        searchedAt: generatedAt,
        status: google?.status ?? "blocked",
        error: google?.error ?? "Google News did not return a player result.",
        candidates: (google?.articles ?? []).map((article) => ({
          url: article.link,
          title: article.title,
          publisher: article.source,
          publishedAt: article.published
        }))
      }],
      googleNewsArticles: google?.articles ?? [],
      candidateUrls: [...new Set([
        ...crawls.flatMap((crawl) => crawl.pages.filter((page) => pageMatchesPlayer(page, player.aliases)).map((page) => page.url)),
        ...(google?.articles.map((article) => article.link) ?? [])
      ])]
    };
  });
  const discovery = {
    worklistId: worklist.worklistId,
    gameweek: input.gameweek,
    generatedAt,
    minimumAppearanceProbability,
    players: results.map((player) => ({ playerId: player.playerId, searches: player.searches }))
  };
  const stored = await updatePlayerStoreTransactionally(storePath, {
    appliedAt: generatedAt,
    update: (staged) => recordNewsDiscovery(staged, discovery)
  });
  return {
    ...stored,
    sourceCount: sources.length,
    completedSources: crawls.filter((crawl) => crawl.status === "completed").length,
    candidateCount: results.reduce((sum, player) => sum + player.candidateUrls.length, 0)
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gameweek = Number(argValue("--gw"));
  const minimumAppearanceProbability = Number(argValue("--min-appearance") ?? "0");
  const maxPagesPerSource = Number(argValue("--max-pages-per-source") ?? "30");
  const sourceIds = process.argv.flatMap((arg, index) => arg === "--source" && process.argv[index + 1] ? [process.argv[index + 1]] : []);
  const playerIds = process.argv.flatMap((arg, index) => arg === "--player" && process.argv[index + 1] ? [Number(process.argv[index + 1])] : []);
  if (!Number.isInteger(gameweek) || gameweek < 1 || minimumAppearanceProbability < 0 || minimumAppearanceProbability > 1 || playerIds.some((id) => !Number.isInteger(id) || id < 1)) {
    console.error("Usage: pnpm evidence:discover -- --gw <n> [--player <id>] [--min-appearance <0..1>] [--max-pages-per-source <n>]");
    process.exitCode = 1;
  } else {
    discoverPlayerNews({ gameweek, minimumAppearanceProbability, maxPagesPerSource, sourceIds, playerIds: playerIds.length ? playerIds : undefined }).then((result) => {
      console.log(`Stored discovery ${result.discoveryId}: ${result.players} players, ${result.completedSources}/${result.sourceCount} sources, ${result.candidateCount} candidate matches.`);
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
