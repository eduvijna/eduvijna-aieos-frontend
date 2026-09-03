/**
 * Canonical Idempotency-Key retention for TeachingExecution mutations.
 * Material must match Backend fingerprint fields exactly.
 */

export function parseRevisionFromEtag(etag: string): number | null {
  const match = /^"r(0|[1-9][0-9]*)"$/.exec(etag.trim());
  if (!match) return null;
  return Number(match[1]);
}

export function startExecutionMaterial(input: {
  workId: string;
  classRef: string;
  bindings: Array<{
    content_id: string;
    content_version_id: string;
    artifact_kind: string;
  }>;
}): string {
  const bindings = [...input.bindings].sort((a, b) =>
    `${a.content_id}${a.content_version_id}${a.artifact_kind}`.localeCompare(
      `${b.content_id}${b.content_version_id}${b.artifact_kind}`,
    ),
  );
  return JSON.stringify({
    work_id: input.workId,
    class_ref: input.classRef,
    bindings,
  });
}

export function observationCreateMaterial(input: {
  executionId: string;
  observationKind: string;
  body: string;
}): string {
  return JSON.stringify({
    execution_id: input.executionId,
    observation_kind: input.observationKind,
    body: input.body,
  });
}

export function observationCorrectMaterial(input: {
  executionId: string;
  observationId: string;
  expectedRevision: number;
  body: string;
}): string {
  return JSON.stringify({
    execution_id: input.executionId,
    observation_id: input.observationId,
    expected_revision: input.expectedRevision,
    body: input.body,
  });
}

export function executionLifecycleMaterial(input: {
  executionId: string;
  expectedAggregateRevision: number;
  action: "complete" | "cancel";
}): string {
  return JSON.stringify({
    execution_id: input.executionId,
    expected_aggregate_revision: input.expectedAggregateRevision,
    action: input.action,
  });
}

/**
 * Reuse key only when canonical material is unchanged; otherwise mint a new key.
 */
export function retainOrMintIdempotencyKey(
  material: string,
  keyRef: { current: string | null },
  materialRef: { current: string | null },
  mint: () => string = () => crypto.randomUUID(),
): string {
  if (materialRef.current !== material) {
    keyRef.current = null;
    materialRef.current = material;
  }
  if (!keyRef.current) {
    keyRef.current = mint();
  }
  return keyRef.current;
}

export function clearIdempotencyAssociation(
  keyRef: { current: string | null },
  materialRef: { current: string | null },
): void {
  keyRef.current = null;
  materialRef.current = null;
}
