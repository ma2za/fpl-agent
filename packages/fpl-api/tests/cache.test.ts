import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readValidatedJsonCache } from "../src";

describe("readValidatedJsonCache", () => {
  it("reads a cache through its schema", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "fpl-agent-cache-"));
    const filePath = path.join(directory, "value.json");
    await writeFile(filePath, JSON.stringify({ id: 1 }), "utf8");

    await expect(
      readValidatedJsonCache(filePath, z.object({ id: z.number() }))
    ).resolves.toEqual({ id: 1 });
  });

  it("includes the cache path for malformed JSON", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "fpl-agent-cache-"));
    const filePath = path.join(directory, "broken.json");
    await writeFile(filePath, "{", "utf8");

    await expect(
      readValidatedJsonCache(filePath, z.object({ id: z.number() }))
    ).rejects.toThrow(filePath);
  });

  it("includes field issues for invalid data", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "fpl-agent-cache-"));
    const filePath = path.join(directory, "invalid.json");
    await writeFile(filePath, JSON.stringify({ id: "one" }), "utf8");

    await expect(
      readValidatedJsonCache(filePath, z.object({ id: z.number() }))
    ).rejects.toThrow(/id/);
  });
});
