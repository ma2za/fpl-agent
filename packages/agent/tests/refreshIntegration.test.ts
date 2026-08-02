import { copyFile, mkdir, mkdtemp, readFile, rm, stat, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RefreshManifestSchema } from "../src";
import { acquireRefreshData, refresh } from "../../../scripts/refresh";

const temporaryDirectories: string[] = [];
const fixtureDirectory = path.join("packages", "fpl-api", "tests", "fixtures");

async function temporaryDirectory() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fpl-refresh-integration-"));
  temporaryDirectories.push(root);
  return root;
}

async function fixtureCache(root: string) {
  const rawDir = path.join(root, "raw");
  await mkdir(rawDir, { recursive: true });
  await Promise.all([
    copyFile(path.join(fixtureDirectory, "bootstrap-static.json"), path.join(rawDir, "bootstrap-static.json")),
    copyFile(path.join(fixtureDirectory, "fixtures.json"), path.join(rawDir, "fixtures.json"))
  ]);
  return rawDir;
}

function mockedFetch(bootstrap: string, fixtures: string, calls: string[]): typeof fetch {
  return async (request) => {
    const url = typeof request === "string"
      ? request
      : request instanceof URL
        ? request.toString()
        : request.url;
    calls.push(url);

    if (url.includes("bootstrap-static")) {
      return new Response(bootstrap, { status: 200 });
    }

    if (url.endsWith("/fixtures/")) {
      return new Response(fixtures, { status: 200 });
    }

    if (url.includes("football-data.co.uk")) {
      return new Response(
        "Div,Date,Time,HomeTeam,AwayTeam,AvgH,AvgD,AvgA\nE0,15/08/2026,12:30,Arsenal,Coventry,1.4,4.8,8.5\n",
        { status: 200 }
      );
    }

    return new Response(`<html><title>Fixture evidence</title><body>${"public evidence ".repeat(120)}</body></html>`, {
      status: 200
    });
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("refresh command integration", () => {
  it("runs from validated offline caches and produces deterministic artifacts", async () => {
    const root = await temporaryDirectory();
    const rawDir = await fixtureCache(root);
    const recommendationsDir = path.join(root, "recommendations");
    const input = {
      requestedGameweek: "auto",
      offline: true,
      now: new Date("2026-08-01T12:00:00.000Z"),
      runId: "offline-fixture",
      rawDir,
      processedDir: path.join(root, "processed"),
      recommendationsDir,
      temporaryRoot: path.join(root, "refresh-inputs")
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network forbidden"));
    const first = await refresh(input);
    const firstHashes = first.manifest.artifacts;
    const second = await refresh(input);

    expect(first.promoted).toBe(true);
    expect(second.promoted).toBe(true);
    expect(second.manifest.artifacts).toEqual(firstHashes);
    expect(second.manifest).toMatchObject({
      mode: "offline",
      deadline: { status: "open", time: "2026-08-15T10:00:00Z" }
    });
    expect(second.manifest.stages.find((stage) => stage.id === "odds")?.status).toBe("failed");
    expect(second.manifest.stages.find((stage) => stage.id === "evidence-summary")?.status).toBe("success");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(RefreshManifestSchema.parse(JSON.parse(
      await readFile(path.join(recommendationsDir, "gw-1", "refresh-manifest.json"), "utf8")
    )).status).toBe("success");
    expect(await readFile(path.join(recommendationsDir, "gw-1", "team-news-report.json"), "utf8"))
      .not.toContain(".refresh-");
    const horizon = JSON.parse(await readFile(
      path.join(recommendationsDir, "gw-1", "fixture-horizon-report.json"),
      "utf8"
    )) as { teams: unknown[]; source: { schedulePolicy: string } };
    expect(horizon.teams).toHaveLength(1);
    expect(horizon.source.schedulePolicy).toBe("fpl-primary-no-silent-merge");
  });

  it("fetches each shared FPL input once in a live-style mocked run", async () => {
    const root = await temporaryDirectory();
    const bootstrap = await readFile(path.join(fixtureDirectory, "bootstrap-static.json"), "utf8");
    const fixtures = await readFile(path.join(fixtureDirectory, "fixtures.json"), "utf8");
    const calls: string[] = [];
    const result = await refresh({
      requestedGameweek: "auto",
      offline: false,
      now: new Date("2026-08-01T12:00:00.000Z"),
      runId: "live-fixture",
      rawDir: path.join(root, "raw"),
      processedDir: path.join(root, "processed"),
      recommendationsDir: path.join(root, "recommendations"),
      temporaryRoot: path.join(root, "refresh-inputs"),
      fetchImpl: mockedFetch(bootstrap, fixtures, calls)
    });

    expect(result.promoted).toBe(true);
    expect(calls.filter((url) => url.includes("bootstrap-static"))).toHaveLength(1);
    expect(calls.filter((url) => url.endsWith("/fixtures/"))).toHaveLength(1);
    expect(result.manifest.stages.every((stage) => stage.status === "success")).toBe(true);
    expect(result.manifest.stages.find((stage) => stage.id === "fixtures")?.artifactPaths).toContain(
      "fixture-horizon-report.json"
    );
    expect(await readFile(path.join(root, "recommendations", "gw-1", "public-evidence-report.json"), "utf8"))
      .not.toContain(".refresh-");
    expect(await stat(path.join(root, "raw", "bootstrap-static.json"))).toBeDefined();
    expect(await stat(path.join(root, "processed", "players.json"))).toBeDefined();
  });

  it("lists every missing required offline cache", async () => {
    const root = await temporaryDirectory();

    await expect(acquireRefreshData({
      offline: true,
      runId: "missing",
      now: new Date("2026-08-01T12:00:00.000Z"),
      rawDir: path.join(root, "raw"),
      processedDir: path.join(root, "processed")
    })).rejects.toThrow(/bootstrap:[\s\S]*fixtures:/);
  });

  it("accepts visible stale caches by default and can reject them by policy", async () => {
    const root = await temporaryDirectory();
    const rawDir = await fixtureCache(root);
    const oldDate = new Date("2026-01-01T00:00:00.000Z");
    await Promise.all([
      utimes(path.join(rawDir, "bootstrap-static.json"), oldDate, oldDate),
      utimes(path.join(rawDir, "fixtures.json"), oldDate, oldDate)
    ]);
    const base = {
      offline: true,
      runId: "stale",
      now: new Date("2026-08-01T12:00:00.000Z"),
      rawDir,
      processedDir: path.join(root, "processed")
    };

    const accepted = await acquireRefreshData(base);

    expect(accepted.inputs.map((input) => input.freshness)).toEqual(["stale", "stale", "stale"]);
    await expect(acquireRefreshData({ ...base, rejectStale: true })).rejects.toThrow(
      "Refresh rejected stale caches: bootstrap, fixtures, normalized-players."
    );
  });

  it.each([
    ["2026-08-16T12:00:00.000Z", "passed"],
    ["2026-08-01T12:00:00.000Z", "unknown"]
  ] as const)("records %s deadline resolution as %s", async (now, expectedStatus) => {
    const root = await temporaryDirectory();
    const rawDir = await fixtureCache(root);
    const requestedGameweek = expectedStatus === "unknown" ? "2" : "1";
    const result = await refresh({
      requestedGameweek,
      offline: true,
      now: new Date(now),
      runId: `deadline-${expectedStatus}`,
      rawDir,
      processedDir: path.join(root, "processed"),
      recommendationsDir: path.join(root, "recommendations")
    });

    expect(result.manifest.deadline.status).toBe(expectedStatus);
  });
});
