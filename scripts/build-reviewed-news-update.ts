import path from "node:path";
import {
  contentHash,
  EvidenceIngestionBatchSchema,
  ingestEvidenceBatch,
  latestNewsDiscovery,
  recordNewsCandidateReviews,
  stableId,
  updatePlayerStoreTransactionally
} from "../packages/player-store/src";

export type ReviewedNewsDocument = {
  canonicalUrl: string;
  publisher: string;
  title: string;
  publishedAt: string;
  excerpt: string;
  observations: Array<{
    playerId: number;
    category: "availability" | "role" | "injury" | "lineup" | "transfer" | "set_piece" | "general";
    credibility: { score: number; rationale: string };
    relevance: { score: number; rationale: string };
    note: string;
  }>;
};

export async function buildReviewedNewsUpdate(input: {
  gameweek: number;
  documents: ReviewedNewsDocument[];
  storePath?: string;
  authoredAt?: string;
  agent?: string;
  now?: Date;
}) {
  const storePath = input.storePath ?? path.join("data", "player-intelligence", "player-intelligence.sqlite");
  const authoredAt = input.authoredAt ?? new Date().toISOString();
  return updatePlayerStoreTransactionally(storePath, {
    appliedAt: authoredAt,
    update: (db) => {
      const discovery = latestNewsDiscovery(db, input.gameweek);
      if (!discovery) throw new Error(`No stored news discovery exists for GW${input.gameweek}.`);
      if (new Set(input.documents.map((document) => document.canonicalUrl)).size !== input.documents.length) {
        throw new Error("Reviewed news documents must have unique canonical URLs.");
      }
      const relevantUrls = new Map<number, string[]>();
      for (const document of input.documents) {
        if (document.observations.length === 0) {
          throw new Error(`Reviewed news document ${document.canonicalUrl} has no player observation.`);
        }
        const publishedAt = Date.parse(document.publishedAt);
        const reviewedAt = Date.parse(authoredAt);
        if (!Number.isFinite(publishedAt) || publishedAt > reviewedAt || reviewedAt - publishedAt > 14 * 24 * 60 * 60 * 1000) {
          throw new Error(`Reviewed news document ${document.canonicalUrl} is outside the 14-day evidence window.`);
        }
        for (const observation of document.observations) {
          const player = discovery.players.find((item) => item.playerId === observation.playerId);
          if (!player?.candidateUrls.includes(document.canonicalUrl)) {
            throw new Error(`Reviewed news document ${document.canonicalUrl} was not discovered for player ${observation.playerId}.`);
          }
          relevantUrls.set(observation.playerId, [...(relevantUrls.get(observation.playerId) ?? []), document.canonicalUrl]);
        }
      }
      const coverage = discovery.players.filter((player) => relevantUrls.has(player.playerId)).map((player) => {
        const relevant = [...new Set(relevantUrls.get(player.playerId) ?? [])];
        const searches = player.searches.map((search) => ({
          query: search.query,
          provider: search.provider,
          searchedAt: search.searchedAt,
          status: search.status,
          resultUrls: search.resultUrls,
          relevantUrls: search.resultUrls.filter((url) => relevant.includes(url))
        }));
        const completed = searches.some((search) => search.status === "completed");
        return {
          playerId: player.playerId,
          status: relevant.length > 0 ? "searched_with_results" as const : completed ? "searched_zero_results" as const : "blocked" as const,
          searchedAt: discovery.generatedAt,
          queries: searches.map((search) => search.query),
          searches,
          note: relevant.length > 0
            ? `${player.candidateUrls.length} candidates assessed; ${relevant.length} material current update(s) verified at the root source.`
            : completed
              ? `${player.candidateUrls.length} candidates assessed; no material current update verified.`
              : "Every configured search provider was blocked."
        };
      });
      const documents = input.documents.map(({ observations: _observations, ...document }) => ({
        ...document,
        retrievedAt: authoredAt,
        contentHash: contentHash(document),
        rawCapturePath: null
      }));
      const observations = input.documents.flatMap((document) => document.observations.map((observation) => ({
        ...observation,
        documentContentHash: contentHash({
          canonicalUrl: document.canonicalUrl,
          publisher: document.publisher,
          title: document.title,
          publishedAt: document.publishedAt,
          excerpt: document.excerpt
        }),
        adapterVersion: "google-news-api-root-review/0.0.20"
      })));
      recordNewsCandidateReviews(db, {
        worklistId: discovery.worklistId,
        decisions: [...relevantUrls].flatMap(([playerId, urls]) => urls.map((url) => ({
          playerId,
          url,
          outcome: "accepted" as const,
          reviewedAt: authoredAt,
          agent: input.agent ?? "Codex Google News root-source review",
          note: "Accepted as a current, player-matched root-source observation."
        })))
      });
      const batchCore = { discoveryId: discovery.discoveryId, authoredAt, coverage, documents, observations };
      const batch = EvidenceIngestionBatchSchema.parse({
        schemaVersion: 1,
        batchId: stableId("batch", batchCore),
        worklistId: discovery.worklistId,
        gameweek: input.gameweek,
        authorship: { kind: "coding_agent", agent: input.agent ?? "Codex Google News root-source review", authoredAt },
        coverage,
        documents,
        observations
      });
      return ingestEvidenceBatch(db, batch, input.now ?? new Date(authoredAt));
    }
  });
}
