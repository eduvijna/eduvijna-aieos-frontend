import { describe, expect, it } from "vitest";
import {
  clearIdempotencyAssociation,
  executionLifecycleMaterial,
  observationCorrectMaterial,
  observationCreateMaterial,
  parseRevisionFromEtag,
  retainOrMintIdempotencyKey,
  startExecutionMaterial,
} from "./executionIdempotency";

describe("executionIdempotency helpers", () => {
  it("parseRevisionFromEtag accepts opaque rN ETags", () => {
    expect(parseRevisionFromEtag('"r0"')).toBe(0);
    expect(parseRevisionFromEtag('"r12"')).toBe(12);
    expect(parseRevisionFromEtag("  \"r3\"  ")).toBe(3);
    expect(parseRevisionFromEtag("r0")).toBeNull();
    expect(parseRevisionFromEtag('"r01"')).toBeNull();
  });

  it("startExecutionMaterial sorts bindings and shapes work/class/bindings", () => {
    const material = startExecutionMaterial({
      workId: "work-1",
      classRef: "class-5a",
      bindings: [
        {
          content_id: "c-b",
          content_version_id: "v-b",
          artifact_kind: "quiz",
        },
        {
          content_id: "c-a",
          content_version_id: "v-a",
          artifact_kind: "worksheet",
        },
      ],
    });
    expect(JSON.parse(material)).toEqual({
      work_id: "work-1",
      class_ref: "class-5a",
      bindings: [
        {
          content_id: "c-a",
          content_version_id: "v-a",
          artifact_kind: "worksheet",
        },
        {
          content_id: "c-b",
          content_version_id: "v-b",
          artifact_kind: "quiz",
        },
      ],
    });
  });

  it("observationCreateMaterial includes execution_id", () => {
    expect(
      JSON.parse(
        observationCreateMaterial({
          executionId: "exec-a",
          observationKind: "PRIVATE_EXECUTION_NOTE",
          body: "note",
        }),
      ),
    ).toEqual({
      execution_id: "exec-a",
      observation_kind: "PRIVATE_EXECUTION_NOTE",
      body: "note",
    });
  });

  it("observationCorrectMaterial includes expected_revision", () => {
    expect(
      JSON.parse(
        observationCorrectMaterial({
          executionId: "exec-a",
          observationId: "obs-1",
          expectedRevision: 2,
          body: "corrected",
        }),
      ),
    ).toEqual({
      execution_id: "exec-a",
      observation_id: "obs-1",
      expected_revision: 2,
      body: "corrected",
    });
  });

  it("executionLifecycleMaterial encodes complete and cancel actions", () => {
    expect(
      JSON.parse(
        executionLifecycleMaterial({
          executionId: "exec-a",
          expectedAggregateRevision: 4,
          action: "complete",
        }),
      ),
    ).toEqual({
      execution_id: "exec-a",
      expected_aggregate_revision: 4,
      action: "complete",
    });
    expect(
      JSON.parse(
        executionLifecycleMaterial({
          executionId: "exec-a",
          expectedAggregateRevision: 4,
          action: "cancel",
        }),
      ),
    ).toEqual({
      execution_id: "exec-a",
      expected_aggregate_revision: 4,
      action: "cancel",
    });
  });

  it("retainOrMintIdempotencyKey reuses key for unchanged material", () => {
    const keyRef = { current: null as string | null };
    const materialRef = { current: null as string | null };
    let minted = 0;
    const mint = () => {
      minted += 1;
      return `key-${minted}`;
    };
    const material = observationCorrectMaterial({
      executionId: "exec-a",
      observationId: "obs-1",
      expectedRevision: 0,
      body: "same",
    });
    const first = retainOrMintIdempotencyKey(
      material,
      keyRef,
      materialRef,
      mint,
    );
    const second = retainOrMintIdempotencyKey(
      material,
      keyRef,
      materialRef,
      mint,
    );
    expect(first).toBe("key-1");
    expect(second).toBe("key-1");
    expect(minted).toBe(1);
  });

  it("revision change mints a new key", () => {
    const keyRef = { current: null as string | null };
    const materialRef = { current: null as string | null };
    let minted = 0;
    const mint = () => {
      minted += 1;
      return `key-${minted}`;
    };
    const first = retainOrMintIdempotencyKey(
      observationCorrectMaterial({
        executionId: "exec-a",
        observationId: "obs-1",
        expectedRevision: 0,
        body: "same",
      }),
      keyRef,
      materialRef,
      mint,
    );
    const second = retainOrMintIdempotencyKey(
      observationCorrectMaterial({
        executionId: "exec-a",
        observationId: "obs-1",
        expectedRevision: 1,
        body: "same",
      }),
      keyRef,
      materialRef,
      mint,
    );
    expect(first).toBe("key-1");
    expect(second).toBe("key-2");
    expect(minted).toBe(2);
  });

  it("different execution_id in create material mints a new key", () => {
    const keyRef = { current: null as string | null };
    const materialRef = { current: null as string | null };
    let minted = 0;
    const mint = () => {
      minted += 1;
      return `key-${minted}`;
    };
    const first = retainOrMintIdempotencyKey(
      observationCreateMaterial({
        executionId: "exec-a",
        observationKind: "CLASS_OBSERVATION",
        body: "same body",
      }),
      keyRef,
      materialRef,
      mint,
    );
    const second = retainOrMintIdempotencyKey(
      observationCreateMaterial({
        executionId: "exec-b",
        observationKind: "CLASS_OBSERVATION",
        body: "same body",
      }),
      keyRef,
      materialRef,
      mint,
    );
    expect(first).not.toBe(second);
  });

  it("clearIdempotencyAssociation drops key and material", () => {
    const keyRef = { current: "kept" as string | null };
    const materialRef = { current: "mat" as string | null };
    clearIdempotencyAssociation(keyRef, materialRef);
    expect(keyRef.current).toBeNull();
    expect(materialRef.current).toBeNull();
  });
});
