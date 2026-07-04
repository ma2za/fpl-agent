import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import bootstrap from "./fixtures/bootstrap-static.json";
import { bootstrapCachePath, createFplApiClient } from "../src";

function jsonResponse(data: unknown) {
  return {
    ok: true,
    text: async () => JSON.stringify(data)
  } as Response;
}

describe("createFplApiClient", () => {
  it("fetches, validates, and caches bootstrap-static data", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "fpl-agent-"));
    const client = createFplApiClient({
      cacheDir,
      fetchImpl: async () => jsonResponse(bootstrap),
      forceRefresh: true
    });

    const data = await client.getBootstrapStatic();
    const cached = JSON.parse(await readFile(bootstrapCachePath(cacheDir), "utf8"));

    expect(data.elements).toHaveLength(2);
    expect(cached.elements).toHaveLength(2);
  });

  it("falls back to cache when refresh fails", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "fpl-agent-"));
    const seededClient = createFplApiClient({
      cacheDir,
      fetchImpl: async () => jsonResponse(bootstrap),
      forceRefresh: true
    });
    await seededClient.getBootstrapStatic();

    const fallbackClient = createFplApiClient({
      cacheDir,
      fetchImpl: async () => {
        throw new Error("offline");
      },
      forceRefresh: true
    });

    const data = await fallbackClient.getBootstrapStatic();

    expect(data.elements[0].web_name).toBe("Raya");
  });
});
