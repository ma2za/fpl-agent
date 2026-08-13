import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireRefreshData } from "../../../scripts/refresh";

const roots: string[] = [];
const fixtureDirectory = path.join("packages", "fpl-api", "tests", "fixtures");

async function root() {
  const value = await mkdtemp(path.join(os.tmpdir(), "player-summary-refresh-"));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe("all-player summary acquisition", () => {
  it("retries three total attempts and records an exhausted player without aborting", async () => {
    const directory = await root();
    const bootstrap = await readFile(path.join(fixtureDirectory, "bootstrap-static.json"), "utf8");
    const fixtures = await readFile(path.join(fixtureDirectory, "fixtures.json"), "utf8");
    let summaryCalls = 0;
    const fetchImpl: typeof fetch = async (request) => {
      const url = String(request);
      if (url.includes("bootstrap-static")) return new Response(bootstrap);
      if (url.endsWith("/fixtures/")) return new Response(fixtures);
      summaryCalls += 1;
      return new Response("unavailable", { status: 503 });
    };
    const data = await acquireRefreshData({
      offline: false, runId: "retry", now: new Date("2026-08-01T12:00:00.000Z"),
      rawDir: path.join(directory, "raw"), processedDir: path.join(directory, "processed"),
      temporaryRoot: path.join(directory, "temporary"), fetchImpl, summaryRetryDelaysMs: [0, 0]
    });
    expect(summaryCalls).toBe(6);
    expect(data.summaries).toHaveLength(2);
    expect(data.summaries.every((item) => item.status === "failed" && item.history.length === 0)).toBe(true);
  });

  it("limits summary requests to six concurrent workers and preserves complete coverage", async () => {
    const directory = await root();
    const bootstrap = JSON.parse(await readFile(path.join(fixtureDirectory, "bootstrap-static.json"), "utf8"));
    const fixtures = await readFile(path.join(fixtureDirectory, "fixtures.json"), "utf8");
    bootstrap.elements = Array.from({ length: 8 }, (_, index) => ({ ...bootstrap.elements[0], id: index + 1, web_name: `P${index + 1}` }));
    let active = 0;
    let maximum = 0;
    const fetchImpl: typeof fetch = async (request) => {
      const url = String(request);
      if (url.includes("bootstrap-static")) return new Response(JSON.stringify(bootstrap));
      if (url.endsWith("/fixtures/")) return new Response(fixtures);
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return new Response(JSON.stringify({ fixtures: [], history: [{ fixture: 1, round: 1 }], history_past: [] }));
    };
    const data = await acquireRefreshData({
      offline: false, runId: "concurrency", now: new Date("2026-08-01T12:00:00.000Z"),
      rawDir: path.join(directory, "raw"), processedDir: path.join(directory, "processed"),
      temporaryRoot: path.join(directory, "temporary"), fetchImpl
    });
    expect(maximum).toBe(6);
    expect(data.summaries).toHaveLength(8);
    expect(data.summaries.every((item) => item.status === "available")).toBe(true);
  });

  it("uses only validated offline caches and marks missing histories explicitly", async () => {
    const directory = await root();
    const rawDir = path.join(directory, "raw");
    await mkdir(path.join(rawDir, "element-summary"), { recursive: true });
    await Promise.all([
      writeFile(path.join(rawDir, "bootstrap-static.json"), await readFile(path.join(fixtureDirectory, "bootstrap-static.json"))),
      writeFile(path.join(rawDir, "fixtures.json"), await readFile(path.join(fixtureDirectory, "fixtures.json")))
    ]);
    const data = await acquireRefreshData({
      offline: true, runId: "offline", now: new Date("2026-08-01T12:00:00.000Z"),
      rawDir, processedDir: path.join(directory, "processed"), fetchImpl: async () => { throw new Error("network called"); }
    });
    expect(data.summaries).toHaveLength(2);
    expect(data.summaries.every((item) => item.status === "missing" && item.retrievedAt === null)).toBe(true);
  });
});
