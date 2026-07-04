import { z } from "zod";
import {
  DEFAULT_RAW_DATA_DIR,
  bootstrapCachePath,
  fixturesCachePath,
  liveGameweekCachePath,
  managerCachePath,
  managerHistoryCachePath,
  managerPicksCachePath,
  managerTransfersCachePath,
  playerSummaryCachePath,
  readJsonCache,
  writeJsonCache
} from "./cache";
import { buildFplUrl, FPL_BASE_URL, FPL_ENDPOINTS } from "./endpoints";
import {
  BootstrapStaticSchema,
  FixtureSchema,
  LiveGameweekSchema,
  PlayerSummarySchema,
  UnknownPublicEndpointSchema
} from "./schemas";

type FetchLike = typeof fetch;

export type FplApiClientOptions = {
  baseUrl?: string;
  cacheDir?: string;
  fetchImpl?: FetchLike;
  forceRefresh?: boolean;
};

async function readResponseJson(response: Response, path: string) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`FPL API returned non-JSON for ${path}`);
  }
}

async function fetchJson(
  path: string,
  cacheFile: string,
  schema: z.ZodType,
  options: Required<FplApiClientOptions>
) {
  if (!options.forceRefresh) {
    try {
      return schema.parse(await readJsonCache(cacheFile));
    } catch {
      // Cache misses fall through to the public API.
    }
  }

  try {
    const response = await options.fetchImpl(buildFplUrl(path, options.baseUrl), {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
        referer: "https://fantasy.premierleague.com/",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`FPL API returned ${response.status} for ${path}`);
    }

    const json = await readResponseJson(response, path);
    const parsed = schema.parse(json);
    await writeJsonCache(cacheFile, parsed);
    return parsed;
  } catch (error) {
    try {
      return schema.parse(await readJsonCache(cacheFile));
    } catch {
      throw error;
    }
  }
}

export function createFplApiClient(options: FplApiClientOptions = {}) {
  const resolvedOptions: Required<FplApiClientOptions> = {
    baseUrl: options.baseUrl ?? FPL_BASE_URL,
    cacheDir: options.cacheDir ?? DEFAULT_RAW_DATA_DIR,
    fetchImpl: options.fetchImpl ?? fetch,
    forceRefresh: options.forceRefresh ?? false
  };

  return {
    getBootstrapStatic: () =>
      fetchJson(
        FPL_ENDPOINTS.bootstrapStatic,
        bootstrapCachePath(resolvedOptions.cacheDir),
        BootstrapStaticSchema,
        resolvedOptions
      ),
    getFixtures: () =>
      fetchJson(
        FPL_ENDPOINTS.fixtures,
        fixturesCachePath(resolvedOptions.cacheDir),
        z.array(FixtureSchema),
        resolvedOptions
      ),
    getPlayerSummary: (playerId: number) =>
      fetchJson(
        FPL_ENDPOINTS.playerSummary(playerId),
        playerSummaryCachePath(playerId, resolvedOptions.cacheDir),
        PlayerSummarySchema,
        resolvedOptions
      ),
    getLiveGameweek: (gameweekId: number) =>
      fetchJson(
        FPL_ENDPOINTS.liveGameweek(gameweekId),
        liveGameweekCachePath(gameweekId, resolvedOptions.cacheDir),
        LiveGameweekSchema,
        resolvedOptions
      ),
    getManagerTeam: (managerId: number) =>
      fetchJson(
        FPL_ENDPOINTS.manager(managerId),
        managerCachePath(managerId, resolvedOptions.cacheDir),
        UnknownPublicEndpointSchema,
        resolvedOptions
      ),
    getManagerPicks: (managerId: number, gameweekId: number) =>
      fetchJson(
        FPL_ENDPOINTS.managerPicks(managerId, gameweekId),
        managerPicksCachePath(managerId, gameweekId, resolvedOptions.cacheDir),
        UnknownPublicEndpointSchema,
        resolvedOptions
      ),
    getManagerHistory: (managerId: number) =>
      fetchJson(
        FPL_ENDPOINTS.managerHistory(managerId),
        managerHistoryCachePath(managerId, resolvedOptions.cacheDir),
        UnknownPublicEndpointSchema,
        resolvedOptions
      ),
    getManagerTransfers: (managerId: number) =>
      fetchJson(
        FPL_ENDPOINTS.managerTransfers(managerId),
        managerTransfersCachePath(managerId, resolvedOptions.cacheDir),
        UnknownPublicEndpointSchema,
        resolvedOptions
      )
  };
}
