import type {
  ClaimIndependence,
  ClaimLedger,
  ClaimLedgerValidation,
  WeeklyRecommendation
} from "./types";

function duplicates(ids: string[]) {
  const seen = new Set<string>();
  return ids.filter((id) => {
    if (seen.has(id)) return true;
    seen.add(id);
    return false;
  });
}

export function countIndependentSources(ledger: ClaimLedger): ClaimIndependence[] {
  const sources = new Map(ledger.sources.map((source) => [source.id, source]));
  const observations = new Map(ledger.observations.map((observation) => [observation.id, observation]));
  const publishersByClaim = new Map<string, Set<string>>();

  for (const fact of ledger.facts) {
    const publishers = publishersByClaim.get(fact.claim) ?? new Set<string>();
    for (const observationId of fact.observationIds) {
      const observation = observations.get(observationId);
      const source = observation && sources.get(observation.sourceId);
      if (source) publishers.add(source.publisher);
    }
    publishersByClaim.set(fact.claim, publishers);
  }

  return [...publishersByClaim]
    .map(([claim, publishers]) => ({
      claim,
      publishers: [...publishers].sort(),
      independentSourceCount: publishers.size
    }))
    .sort((a, b) => a.claim.localeCompare(b.claim));
}

export function validateClaimLedger(ledger: ClaimLedger): ClaimLedgerValidation {
  const errors: string[] = [];
  const sources = new Set(ledger.sources.map((item) => item.id));
  const observations = new Set(ledger.observations.map((item) => item.id));
  const facts = new Set(ledger.facts.map((item) => item.id));
  const assumptions = new Set(ledger.assumptions.map((item) => item.id));
  const transformations = new Set(ledger.transformations.map((item) => item.id));
  const decisions = new Set(ledger.decisions.map((item) => item.id));
  const allIds = [...sources, ...observations, ...facts, ...assumptions, ...transformations, ...decisions];

  for (const id of new Set(duplicates(allIds))) errors.push(`Duplicate claim ledger id ${id}.`);

  for (const observation of ledger.observations) {
    if (!sources.has(observation.sourceId)) errors.push(`Observation ${observation.id} references missing source ${observation.sourceId}.`);
  }

  for (const fact of ledger.facts) {
    if (fact.observationIds.length === 0) errors.push(`Fact ${fact.id} must resolve to at least one observation.`);
    for (const id of fact.observationIds) {
      if (!observations.has(id)) errors.push(`Fact ${fact.id} references missing observation ${id}.`);
    }
    if (fact.transformationId && !transformations.has(fact.transformationId)) {
      errors.push(`Fact ${fact.id} references missing transformation ${fact.transformationId}.`);
    }
  }

  for (const assumption of ledger.assumptions) {
    if (assumption.factIds.length === 0) errors.push(`Assumption ${assumption.id} must reference evidence facts.`);
    for (const id of assumption.factIds) {
      if (!facts.has(id)) errors.push(`Assumption ${assumption.id} references missing fact ${id}.`);
    }
  }

  const dependencyIds = new Set([...observations, ...facts, ...assumptions, ...transformations]);
  for (const transformation of ledger.transformations) {
    if (transformation.inputIds.length === 0) errors.push(`Transformation ${transformation.id} must reference upstream inputs.`);
    for (const id of transformation.inputIds) {
      if (!dependencyIds.has(id)) errors.push(`Transformation ${transformation.id} references missing input ${id}.`);
    }
    for (const id of transformation.outputFactIds) {
      const fact = ledger.facts.find((item) => item.id === id);
      if (!fact) errors.push(`Transformation ${transformation.id} references missing output fact ${id}.`);
      else if (fact.transformationId !== transformation.id) {
        errors.push(`Transformation ${transformation.id} output fact ${id} does not link back to it.`);
      }
    }
  }

  for (const decision of ledger.decisions) {
    if (decision.factIds.length + decision.assumptionIds.length === 0) {
      errors.push(`Decision ${decision.id} must reference facts or assumptions.`);
    }
    for (const id of decision.factIds) {
      if (!facts.has(id)) errors.push(`Decision ${decision.id} references missing fact ${id}.`);
    }
    for (const id of decision.assumptionIds) {
      if (!assumptions.has(id)) errors.push(`Decision ${decision.id} references missing assumption ${id}.`);
    }
  }

  const graph = new Map<string, string[]>();
  for (const fact of ledger.facts) graph.set(fact.id, [...fact.observationIds, ...(fact.transformationId ? [fact.transformationId] : [])]);
  for (const assumption of ledger.assumptions) graph.set(assumption.id, assumption.factIds);
  for (const transformation of ledger.transformations) graph.set(transformation.id, transformation.inputIds);
  for (const decision of ledger.decisions) graph.set(decision.id, [...decision.factIds, ...decision.assumptionIds]);
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const circular = (graph.get(id) ?? []).some(visit);
    visiting.delete(id);
    visited.add(id);
    return circular;
  }

  for (const id of graph.keys()) {
    if (visit(id)) {
      errors.push(`Claim ledger contains a circular dependency involving ${id}.`);
      break;
    }
  }

  return { isValid: errors.length === 0, errors, independence: countIndependentSources(ledger) };
}

export function adaptLegacyRecommendationProvenance(recommendation: WeeklyRecommendation) {
  if (recommendation.schemaVersion === 2 && recommendation.artifactKind === "agent_decision") {
    return { recommendation, claimLedger: recommendation.claimLedger ?? null, warnings: [] };
  }

  return {
    recommendation,
    claimLedger: null,
    warnings: ["Legacy recommendation has no machine-readable claim provenance and is not eligible for final verification."]
  };
}
