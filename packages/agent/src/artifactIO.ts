import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import type { z } from "zod";

export type ArtifactSchema = z.ZodType;

export class ArtifactValidationError extends Error {
  constructor(filePath: string, message: string) {
    super(`Invalid artifact ${filePath}: ${message}`);
    this.name = "ArtifactValidationError";
  }
}

function formatIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "<root>"}: ${issue.message}`)
    .join("; ");
}

export function parseArtifactJson<T>(text: string, schema: z.ZodType<T>, filePath = "<memory>"): T {
  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new ArtifactValidationError(
      filePath,
      error instanceof Error ? error.message : "malformed JSON"
    );
  }

  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ArtifactValidationError(filePath, formatIssues(result.error));
  }

  return result.data;
}

export async function readArtifactFile<T>(filePath: string, schema: z.ZodType<T>) {
  return parseArtifactJson(await readFile(filePath, "utf8"), schema, filePath);
}

export async function readArtifactFileIfExists<T>(filePath: string, schema: z.ZodType<T>) {
  try {
    return await readArtifactFile(filePath, schema);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export function readArtifactFileSync<T>(filePath: string, schema: z.ZodType<T>) {
  return parseArtifactJson(readFileSync(filePath, "utf8"), schema, filePath);
}
