import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_RAW_DATA_DIR = path.join(process.cwd(), "data", "raw");

export function cachePath(baseDir: string, ...segments: string[]) {
  return path.join(baseDir, ...segments);
}

export async function readJsonCache<T>(filePath: string) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonCache(filePath: string, data: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function bootstrapCachePath(baseDir = DEFAULT_RAW_DATA_DIR) {
  return cachePath(baseDir, "bootstrap-static.json");
}

export function fixturesCachePath(baseDir = DEFAULT_RAW_DATA_DIR) {
  return cachePath(baseDir, "fixtures.json");
}

export function playerSummaryCachePath(playerId: number, baseDir = DEFAULT_RAW_DATA_DIR) {
  return cachePath(baseDir, "element-summary", `${playerId}.json`);
}

export function liveGameweekCachePath(gameweekId: number, baseDir = DEFAULT_RAW_DATA_DIR) {
  return cachePath(baseDir, "live", `gw-${gameweekId}.json`);
}

export function managerCachePath(managerId: number, baseDir = DEFAULT_RAW_DATA_DIR) {
  return cachePath(baseDir, "manager", `${managerId}.json`);
}

export function managerPicksCachePath(
  managerId: number,
  gameweekId: number,
  baseDir = DEFAULT_RAW_DATA_DIR
) {
  return cachePath(baseDir, "manager", `${managerId}`, `gw-${gameweekId}-picks.json`);
}

export function managerHistoryCachePath(managerId: number, baseDir = DEFAULT_RAW_DATA_DIR) {
  return cachePath(baseDir, "manager", `${managerId}`, "history.json");
}

export function managerTransfersCachePath(managerId: number, baseDir = DEFAULT_RAW_DATA_DIR) {
  return cachePath(baseDir, "manager", `${managerId}`, "transfers.json");
}
