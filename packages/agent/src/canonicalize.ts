const generatedTimestampKeys = new Set([
  "capturedAt",
  "checkedAt",
  "createdAt",
  "fetchedAt",
  "generatedAt"
]);

export function canonicalizeArtifact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeArtifact);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !generatedTimestampKeys.has(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonicalizeArtifact(entry)])
  );
}

export function canonicalArtifactJson(value: unknown) {
  return `${JSON.stringify(canonicalizeArtifact(value), null, 2)}\n`;
}
