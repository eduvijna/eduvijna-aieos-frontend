import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  correctClassroomAssessment,
  getClassroomAssessment,
  listClassroomAssessments,
  recordClassroomAssessment,
  voidClassroomAssessment,
  type ClassroomAssessmentResponse,
} from "@/services/api/classroomAssessmentsApi";
import {
  getTeachingExecution,
  type TeachingExecutionContentBindingResponse,
  type TeachingExecutionResponse,
} from "@/services/api/teachingExecutionsApi";
import { useSession } from "@/services/session/useSession";
import {
  ApiError,
  problemCodeFromApiError,
  userMessageForApiError,
} from "@/shared/errors/ApiError";
import { EmptyState } from "@/shared/components/EmptyState";
import { ErrorState } from "@/shared/components/ErrorState";
import { LoadingState } from "@/shared/components/LoadingState";
import {
  clearIdempotencyAssociation,
  correctAssessmentMaterial,
  recordAssessmentMaterial,
  resolveRevisionSensitiveIdempotencyKey,
  retainOrMintIdempotencyKey,
  voidAssessmentMaterial,
} from "./assessmentIdempotency";
import {
  assessHrefForAssessment,
  assessmentRevisionEtag,
  CLASS_RESULT_LEVELS,
  CLASS_RESULT_NOTE_MAX,
  CLASS_RESULT_NOTE_PRIVACY_REMINDER,
  eligibleAssessmentBindings,
  formatAssessmentInstant,
  formatAssessmentLifecycleLabel,
  formatClassResultLevelLabel,
  isAssessmentRecorded,
  isAssessmentVoided,
  isClassResultLevel,
  type ClassResultLevel,
} from "./assessmentPresentation";
import "../teach/teach.css";
import "./assess.css";

type PageStatus =
  | "loading"
  | "unavailable"
  | "ready"
  | "error"
  | "recording"
  | "correcting"
  | "voiding";

function normalizeNote(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function bindingKey(binding: TeachingExecutionContentBindingResponse): string {
  return `${binding.content_id}:${binding.content_version_id}`;
}

export function AssessPage() {
  const { session } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const executionIdParam = searchParams.get("execution_id");
  const assessmentIdParam = searchParams.get("assessment_id");

  const [status, setStatus] = useState<PageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [execution, setExecution] = useState<TeachingExecutionResponse | null>(
    null,
  );
  const [eligibleBindings, setEligibleBindings] = useState<
    TeachingExecutionContentBindingResponse[]
  >([]);
  const [selectedBindingKey, setSelectedBindingKey] = useState<string | null>(
    null,
  );
  const [history, setHistory] = useState<ClassroomAssessmentResponse[]>([]);
  const [selected, setSelected] = useState<ClassroomAssessmentResponse | null>(
    null,
  );
  const [selectedEtag, setSelectedEtag] = useState<string | null>(null);

  const [resultLevel, setResultLevel] =
    useState<ClassResultLevel>("DEMONSTRATED");
  const [resultNote, setResultNote] = useState("");
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [voidBasisRevision, setVoidBasisRevision] = useState<number | null>(
    null,
  );
  const [staleNotice, setStaleNotice] = useState<string | null>(null);

  const recordKeyRef = useRef<string | null>(null);
  const recordMaterialRef = useRef<string | null>(null);
  const correctKeyRef = useRef<string | null>(null);
  const correctMaterialRef = useRef<string | null>(null);
  const voidKeyRef = useRef<string | null>(null);
  const voidMaterialRef = useRef<string | null>(null);
  const mutationInFlightRef = useRef(false);

  const selectedBinding = useMemo(() => {
    if (!selectedBindingKey) return null;
    return (
      eligibleBindings.find(
        (binding) => bindingKey(binding) === selectedBindingKey,
      ) ?? null
    );
  }, [eligibleBindings, selectedBindingKey]);

  const clearMutationAssociation = useCallback(
    (operation: "record" | "correct" | "void") => {
      switch (operation) {
        case "record":
          clearIdempotencyAssociation(recordKeyRef, recordMaterialRef);
          break;
        case "correct":
          clearIdempotencyAssociation(correctKeyRef, correctMaterialRef);
          break;
        case "void":
          clearIdempotencyAssociation(voidKeyRef, voidMaterialRef);
          break;
      }
    },
    [],
  );

  const applySelectedAssessment = useCallback(
    (assessment: ClassroomAssessmentResponse, etag: string | null) => {
      setSelected(assessment);
      setSelectedEtag(etag ?? assessmentRevisionEtag(assessment.aggregate_revision));
      if (isClassResultLevel(assessment.class_result_level)) {
        setResultLevel(assessment.class_result_level);
      }
      setResultNote(assessment.class_result_note ?? "");
      setConfirmVoid(false);
      setVoidBasisRevision(null);
    },
    [],
  );

  const load = useCallback(async () => {
    if (!session) {
      setStatus("unavailable");
      setExecution(null);
      setHistory([]);
      setSelected(null);
      return;
    }

    setStatus("loading");
    setErrorMessage(null);
    setActionMessage(null);
    setStaleNotice(null);

    try {
      let loadedExecution: TeachingExecutionResponse | null = null;
      let bindings: TeachingExecutionContentBindingResponse[] = [];

      if (executionIdParam) {
        const executionResponse = await getTeachingExecution(executionIdParam);
        loadedExecution = executionResponse.data;
        setExecution(loadedExecution);
        bindings = eligibleAssessmentBindings(loadedExecution.bindings);
        setEligibleBindings(bindings);
        setSelectedBindingKey((current) => {
          if (
            current &&
            bindings.some((binding) => bindingKey(binding) === current)
          ) {
            return current;
          }
          return bindings.length > 0 ? bindingKey(bindings[0]!) : null;
        });
      } else {
        setExecution(null);
        setEligibleBindings([]);
        setSelectedBindingKey(null);
      }

      const listResponse = await listClassroomAssessments({
        executionId: executionIdParam,
        limit: 50,
      });
      const items = listResponse.data.items;
      setHistory(items);

      if (assessmentIdParam) {
        const detail = await getClassroomAssessment(assessmentIdParam);
        applySelectedAssessment(detail.data, detail.etag);
      } else if (
        executionIdParam &&
        items.length === 1 &&
        items[0]?.execution_id === executionIdParam
      ) {
        const detail = await getClassroomAssessment(items[0]!.assessment_id);
        applySelectedAssessment(detail.data, detail.etag);
      } else {
        setSelected(null);
        setSelectedEtag(null);
      }

      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setErrorMessage(messageForAssessError(error));
    }
  }, [
    session,
    executionIdParam,
    assessmentIdParam,
    applySelectedAssessment,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reloadSelected(assessmentId: string) {
    const detail = await getClassroomAssessment(assessmentId);
    applySelectedAssessment(detail.data, detail.etag);
    return detail;
  }

  async function onRecord() {
    if (!session || !execution || !selectedBinding || mutationInFlightRef.current) {
      return;
    }
    if (execution.lifecycle_state !== "COMPLETED") {
      setActionMessage(
        "Only a COMPLETED TeachingExecution can be assessed from this context.",
      );
      return;
    }
    if (resultNote.length > CLASS_RESULT_NOTE_MAX) {
      setActionMessage(
        `Class result note must be at most ${CLASS_RESULT_NOTE_MAX} characters.`,
      );
      return;
    }

    const note = normalizeNote(resultNote);
    const body = {
      class_ref: execution.class_ref,
      content_id: selectedBinding.content_id,
      content_version_id: selectedBinding.content_version_id,
      class_result_level: resultLevel,
      class_result_note: note,
      execution_id: execution.execution_id,
      work_id: execution.work_id,
      assignment_id: null,
    };
    const material = recordAssessmentMaterial({
      classRef: body.class_ref,
      contentId: body.content_id,
      contentVersionId: body.content_version_id,
      classResultLevel: body.class_result_level,
      classResultNote: note,
      executionId: body.execution_id,
      workId: body.work_id,
      assignmentId: null,
    });
    const key = retainOrMintIdempotencyKey(
      material,
      recordKeyRef,
      recordMaterialRef,
    );

    mutationInFlightRef.current = true;
    setBusy(true);
    setStatus("recording");
    setActionMessage(null);
    setErrorMessage(null);
    try {
      const response = await recordClassroomAssessment(body, key);
      clearMutationAssociation("record");
      applySelectedAssessment(response.data, response.etag);
      setSearchParams(
        {
          execution_id: execution.execution_id,
          assessment_id: response.data.assessment_id,
        },
        { replace: true },
      );
      setActionMessage(
        "Classroom assessment recorded. This is class-level evidence — not mastery and not individual learner grades.",
      );
      const listResponse = await listClassroomAssessments({
        executionId: execution.execution_id,
        limit: 50,
      });
      setHistory(listResponse.data.items);
      setStatus("ready");
    } catch (error) {
      setStatus("ready");
      await handleMutationError(error, { invalidate: "record" });
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function onCorrect() {
    if (!session || !selected || mutationInFlightRef.current) return;
    if (!isAssessmentRecorded(selected)) {
      setActionMessage("Only a RECORDED ClassroomAssessment can be corrected.");
      return;
    }
    if (resultNote.length > CLASS_RESULT_NOTE_MAX) {
      setActionMessage(
        `Class result note must be at most ${CLASS_RESULT_NOTE_MAX} characters.`,
      );
      return;
    }

    const reviewedRevision = selected.aggregate_revision;
    const reviewedEtag =
      selectedEtag ?? assessmentRevisionEtag(reviewedRevision);
    const draftLevel = resultLevel;
    const draftNoteText = resultNote;
    const note = normalizeNote(draftNoteText);

    setBusy(true);
    setStatus("correcting");
    setActionMessage(null);
    setStaleNotice(null);
    try {
      // Preflight validates current server revision only — do not apply yet
      // (that would silently transfer this draft onto a newer revision).
      const fresh = await getClassroomAssessment(selected.assessment_id);
      if (fresh.data.aggregate_revision !== reviewedRevision) {
        clearMutationAssociation("correct");
        applySelectedAssessment(fresh.data, fresh.etag);
        setStaleNotice(
          "This ClassroomAssessment changed on the server since you reviewed it. Review the current result, then take a new deliberate correction. No automatic resubmit.",
        );
        setStatus("ready");
        return;
      }
      if (!isAssessmentRecorded(fresh.data)) {
        clearMutationAssociation("correct");
        applySelectedAssessment(fresh.data, fresh.etag);
        setActionMessage(
          "This ClassroomAssessment is no longer RECORDED. Review the current state.",
        );
        setStatus("ready");
        return;
      }

      // Same revision: restore draft explicitly so preflight cannot erase it.
      setResultLevel(draftLevel);
      setResultNote(draftNoteText);

      const material = correctAssessmentMaterial({
        assessmentId: selected.assessment_id,
        expectedAggregateRevision: reviewedRevision,
        classResultLevel: draftLevel,
        classResultNote: note,
      });
      const keyResult = resolveRevisionSensitiveIdempotencyKey(
        material,
        correctKeyRef,
        correctMaterialRef,
      );
      if (keyResult.kind === "abort_stale_material") {
        clearMutationAssociation("correct");
        setStaleNotice(
          "Your correction draft changed while a retry was in flight. Review the current result and start a new deliberate correction.",
        );
        setStatus("ready");
        return;
      }

      mutationInFlightRef.current = true;
      const response = await correctClassroomAssessment(
        selected.assessment_id,
        {
          class_result_level: draftLevel,
          class_result_note: note,
        },
        reviewedEtag,
        keyResult.key,
      );
      clearMutationAssociation("correct");
      applySelectedAssessment(response.data, response.etag);
      setActionMessage("Classroom assessment corrected.");
      const listResponse = await listClassroomAssessments({
        executionId: executionIdParam,
        limit: 50,
      });
      setHistory(listResponse.data.items);
      setStatus("ready");
    } catch (error) {
      setStatus("ready");
      await handleMutationError(error, { invalidate: "correct" });
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function onVoid() {
    if (!session || !selected || mutationInFlightRef.current) return;
    if (!isAssessmentRecorded(selected)) {
      setActionMessage("Only a RECORDED ClassroomAssessment can be voided.");
      return;
    }

    const reviewedRevision =
      voidBasisRevision ?? selected.aggregate_revision;
    const reviewedEtag =
      selectedEtag ?? assessmentRevisionEtag(reviewedRevision);

    setBusy(true);
    setStatus("voiding");
    setActionMessage(null);
    setStaleNotice(null);
    try {
      const fresh = await getClassroomAssessment(selected.assessment_id);
      if (fresh.data.aggregate_revision !== reviewedRevision) {
        clearMutationAssociation("void");
        applySelectedAssessment(fresh.data, fresh.etag);
        setStaleNotice(
          "This ClassroomAssessment changed on the server since you confirmed void. Review the current result and confirm void again against the new state.",
        );
        setStatus("ready");
        return;
      }
      if (!isAssessmentRecorded(fresh.data)) {
        clearMutationAssociation("void");
        applySelectedAssessment(fresh.data, fresh.etag);
        setActionMessage(
          "This ClassroomAssessment is no longer RECORDED. Review the current state.",
        );
        setStatus("ready");
        return;
      }

      const material = voidAssessmentMaterial({
        assessmentId: selected.assessment_id,
        expectedAggregateRevision: reviewedRevision,
      });
      const keyResult = resolveRevisionSensitiveIdempotencyKey(
        material,
        voidKeyRef,
        voidMaterialRef,
      );
      if (keyResult.kind === "abort_stale_material") {
        clearMutationAssociation("void");
        setConfirmVoid(false);
        setVoidBasisRevision(null);
        setStaleNotice(
          "Void confirmation changed while a retry was in flight. Review the Assessment and confirm void again.",
        );
        setStatus("ready");
        return;
      }

      mutationInFlightRef.current = true;
      const response = await voidClassroomAssessment(
        selected.assessment_id,
        reviewedEtag,
        keyResult.key,
      );
      clearMutationAssociation("void");
      applySelectedAssessment(response.data, response.etag);
      setActionMessage(
        "Classroom assessment voided. VOIDED is terminal and remains visible history.",
      );
      const listResponse = await listClassroomAssessments({
        executionId: executionIdParam,
        limit: 50,
      });
      setHistory(listResponse.data.items);
      setStatus("ready");
    } catch (error) {
      setStatus("ready");
      await handleMutationError(error, {
        invalidate: "void",
        resetConfirm: true,
      });
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function handleMutationError(
    error: unknown,
    options: {
      invalidate: "record" | "correct" | "void";
      resetConfirm?: boolean;
    },
  ) {
    if (options.resetConfirm) {
      setConfirmVoid(false);
      setVoidBasisRevision(null);
    }
    const code = problemCodeFromApiError(error);
    if (error instanceof ApiError && error.status === 412) {
      clearMutationAssociation(options.invalidate);
      if (selected) {
        await reloadSelected(selected.assessment_id);
      } else {
        await load();
      }
      setStaleNotice(
        "This ClassroomAssessment changed on the server. Review the current result, then take a new deliberate action. No automatic resubmit.",
      );
      return;
    }
    if (
      error instanceof ApiError &&
      (error.status === 403 ||
        code === "assessment_capability_forbidden" ||
        code === "class_ref_not_assignable" ||
        code === "classroom_assessment_forbidden")
    ) {
      if (options.invalidate === "record") {
        clearMutationAssociation("record");
      }
      setErrorMessage(
        "You are not authorized for this Assessment action right now. Server authority denied the request.",
      );
      return;
    }
    if (
      error instanceof ApiError &&
      (error.status === 503 ||
        code === "authorization_unavailable" ||
        code === "school_context_unavailable")
    ) {
      setErrorMessage(
        "Assessment authority is temporarily unavailable. No mutation was assumed. Retry when the service recovers.",
      );
      return;
    }
    if (error instanceof ApiError && error.status === 401) {
      setErrorMessage("Authentication required. Connect a valid DEV session.");
      return;
    }
    if (
      error instanceof ApiError &&
      error.status === 409 &&
      code === "idempotency_key_reused"
    ) {
      clearMutationAssociation(options.invalidate);
      setActionMessage(
        "This Idempotency-Key conflicts with different material. Start a new deliberate action (a new key will be minted).",
      );
      return;
    }
    if (
      error instanceof ApiError &&
      error.status === 409 &&
      code === "classroom_assessment_not_recorded"
    ) {
      clearMutationAssociation(options.invalidate);
      if (selected) {
        await reloadSelected(selected.assessment_id);
      } else {
        await load();
      }
      setActionMessage(
        "This ClassroomAssessment is no longer RECORDED. Review the current server state. No automatic resubmit.",
      );
      return;
    }
    if (error instanceof ApiError && error.status === 409) {
      setActionMessage(
        error.message ||
          "A server conflict prevented this Assessment action. Review the current state and try again.",
      );
      return;
    }
    setErrorMessage(messageForAssessError(error));
  }

  const canRecord =
    Boolean(execution) &&
    execution?.lifecycle_state === "COMPLETED" &&
    Boolean(selectedBinding) &&
    !selected;

  const showExecutionEmptyEligible =
    Boolean(execution) &&
    execution?.lifecycle_state === "COMPLETED" &&
    eligibleBindings.length === 0;

  const showNotCompleted =
    Boolean(execution) && execution?.lifecycle_state !== "COMPLETED";

  return (
    <article className="stack teach-page assess-page">
      <header>
        <p className="muted">Teacher OS · Assess</p>
        <h1>Assess</h1>
        <p className="muted">
          Class-level ClassroomAssessment only. Assigned ≠ Taught ≠ Assessed ≠
          Mastered. Taught ≠ Assessed. Completing a lesson does not create an
          Assessment — recording here does.
        </p>
      </header>

      <div className="status-region" aria-live="polite">
        {status === "loading" ? (
          <LoadingState label="Loading Assess context…" />
        ) : null}
        {status === "unavailable" ? (
          <EmptyState
            title="Session required"
            description="Connect a DEV session to load ClassroomAssessments."
          />
        ) : null}
        {status === "error" && errorMessage ? (
          <ErrorState
            title="Could not load Assess"
            message={errorMessage}
            onRetry={() => void load()}
          />
        ) : null}
      </div>

      {actionMessage ? (
        <p className="status-region" role="status" aria-live="assertive">
          {actionMessage}
        </p>
      ) : null}
      {staleNotice ? (
        <p className="status-region" role="status" aria-live="assertive">
          {staleNotice}
        </p>
      ) : null}
      {errorMessage && status === "ready" ? (
        <ErrorState
          title="Assessment action failed"
          message={errorMessage}
          onRetry={() => {
            setErrorMessage(null);
            void load();
          }}
        />
      ) : null}

      {status !== "unavailable" && status !== "loading" ? (
        <>
          {!executionIdParam && !assessmentIdParam ? (
            <section className="panel" aria-labelledby="assess-start-heading">
              <h2 id="assess-start-heading">Start from a completed lesson</h2>
              <p className="muted">
                Open a COMPLETED TeachingExecution in Teach and choose{" "}
                <strong>Assess this class</strong>. That navigation is advisory
                only — it does not create an Assessment.
              </p>
              <p>
                <Link className="btn btn-secondary" to="/teacher-os/teach">
                  Open Teach
                </Link>
              </p>
            </section>
          ) : null}

          {execution ? (
            <section
              className="panel"
              aria-labelledby="assess-context-heading"
            >
              <h2 id="assess-context-heading">Teaching context</h2>
              <dl className="work-meta">
                <div>
                  <dt>Execution</dt>
                  <dd>
                    <Link
                      to={`/teacher-os/teach/executions/${execution.execution_id}`}
                    >
                      <code>{execution.execution_id}</code>
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>Lifecycle</dt>
                  <dd>
                    <span
                      className="lifecycle-pill"
                      data-state={execution.lifecycle_state}
                    >
                      {execution.lifecycle_state}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>ClassRef</dt>
                  <dd>
                    <code>{execution.class_ref}</code>
                  </dd>
                </div>
                <div>
                  <dt>Work</dt>
                  <dd>
                    <code>{execution.work_id}</code>
                  </dd>
                </div>
              </dl>
              {showNotCompleted ? (
                <EmptyState
                  title="Completed lesson required"
                  description="Assess from a COMPLETED TeachingExecution. In-progress or cancelled lessons are not eligible for this Case A flow."
                />
              ) : null}
              {showExecutionEmptyEligible ? (
                <EmptyState
                  title="No eligible assessment artifact"
                  description="This completed lesson has no quiz, worksheet, or homework binding. Lesson plans, answer keys, and teacher notes cannot be assessed."
                />
              ) : null}
            </section>
          ) : null}

          {canRecord && selectedBinding ? (
            <section className="panel" aria-labelledby="assess-record-heading">
              <h2 id="assess-record-heading">Record class result</h2>
              <p className="muted">
                This records a CLASS-LEVEL result for the exact artifact version
                taught in the completed lesson. It does not mean every learner
                was individually assessed.
              </p>

              {eligibleBindings.length > 1 ? (
                <label className="assign-field">
                  <span>Assessment artifact</span>
                  <select
                    aria-label="Assessment artifact"
                    value={selectedBindingKey ?? ""}
                    disabled={busy}
                    onChange={(event) =>
                      setSelectedBindingKey(event.target.value)
                    }
                  >
                    {eligibleBindings.map((binding) => (
                      <option
                        key={bindingKey(binding)}
                        value={bindingKey(binding)}
                      >
                        {binding.artifact_kind} · version{" "}
                        {binding.content_version_id.slice(0, 8)}…
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <dl className="work-meta">
                  <div>
                    <dt>Artifact kind</dt>
                    <dd>{selectedBinding.artifact_kind}</dd>
                  </div>
                  <div>
                    <dt>Content</dt>
                    <dd>
                      <code>{selectedBinding.content_id}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Content version</dt>
                    <dd>
                      <code>{selectedBinding.content_version_id}</code>
                    </dd>
                  </div>
                </dl>
              )}

              <fieldset className="assess-result-fieldset" disabled={busy}>
                <legend>Class result</legend>
                {CLASS_RESULT_LEVELS.map((option) => (
                  <label key={option.value} className="assess-result-option">
                    <input
                      type="radio"
                      name="class_result_level"
                      value={option.value}
                      checked={resultLevel === option.value}
                      onChange={() => setResultLevel(option.value)}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <span className="muted"> ({option.value})</span>
                      <br />
                      <span className="muted">{option.description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <label className="assign-field">
                <span>Class result note (optional)</span>
                <textarea
                  aria-label="Class result note"
                  value={resultNote}
                  maxLength={CLASS_RESULT_NOTE_MAX}
                  rows={4}
                  disabled={busy}
                  onChange={(event) => setResultNote(event.target.value)}
                />
              </label>
              <p className="muted assess-privacy-reminder">
                {CLASS_RESULT_NOTE_PRIVACY_REMINDER}
              </p>
              <p className="muted">
                {resultNote.length}/{CLASS_RESULT_NOTE_MAX}
              </p>

              <div className="detail-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  aria-busy={busy || status === "recording"}
                  onClick={() => void onRecord()}
                >
                  Record class assessment
                </button>
              </div>
            </section>
          ) : null}

          {selected ? (
            <section
              className="panel"
              aria-labelledby="assess-detail-heading"
            >
              <h2 id="assess-detail-heading">Classroom assessment</h2>
              <dl className="work-meta">
                <div>
                  <dt>Lifecycle</dt>
                  <dd>
                    <span
                      className="lifecycle-pill"
                      data-state={selected.lifecycle_state}
                    >
                      {formatAssessmentLifecycleLabel(selected.lifecycle_state)}{" "}
                      ({selected.lifecycle_state})
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>ClassRef</dt>
                  <dd>
                    <code>{selected.class_ref}</code>
                  </dd>
                </div>
                <div>
                  <dt>Class result</dt>
                  <dd>
                    {formatClassResultLevelLabel(selected.class_result_level)} (
                    {selected.class_result_level})
                  </dd>
                </div>
                <div>
                  <dt>Note</dt>
                  <dd>{selected.class_result_note ?? "—"}</dd>
                </div>
                <div>
                  <dt>Content version</dt>
                  <dd>
                    <code>{selected.content_version_id}</code>
                  </dd>
                </div>
                <div>
                  <dt>Recorded</dt>
                  <dd>{formatAssessmentInstant(selected.recorded_at)}</dd>
                </div>
                {selected.voided_at ? (
                  <div>
                    <dt>Voided</dt>
                    <dd>{formatAssessmentInstant(selected.voided_at)}</dd>
                  </div>
                ) : null}
                {selected.execution_id ? (
                  <div>
                    <dt>TeachingExecution</dt>
                    <dd>
                      <Link
                        to={`/teacher-os/teach/executions/${selected.execution_id}`}
                      >
                        <code>{selected.execution_id}</code>
                      </Link>
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>Revision / ETag</dt>
                  <dd>
                    {selected.aggregate_revision} /{" "}
                    <code>{selectedEtag ?? "—"}</code>
                  </dd>
                </div>
              </dl>

              {isAssessmentVoided(selected) ? (
                <p className="muted">
                  VOIDED is terminal. Correct and void are not available. The
                  record remains visible history — it is not deleted and is not
                  mastery.
                </p>
              ) : null}

              {isAssessmentRecorded(selected) ? (
                <>
                  <fieldset className="assess-result-fieldset" disabled={busy}>
                    <legend>Correct class result</legend>
                    {CLASS_RESULT_LEVELS.map((option) => (
                      <label
                        key={option.value}
                        className="assess-result-option"
                      >
                        <input
                          type="radio"
                          name="correct_class_result_level"
                          value={option.value}
                          checked={resultLevel === option.value}
                          onChange={() => setResultLevel(option.value)}
                        />
                        <span>
                          <strong>{option.label}</strong>
                          <span className="muted"> ({option.value})</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <label className="assign-field">
                    <span>Class result note (optional)</span>
                    <textarea
                      aria-label="Correct class result note"
                      value={resultNote}
                      maxLength={CLASS_RESULT_NOTE_MAX}
                      rows={4}
                      disabled={busy}
                      onChange={(event) => setResultNote(event.target.value)}
                    />
                  </label>
                  <p className="muted assess-privacy-reminder">
                    {CLASS_RESULT_NOTE_PRIVACY_REMINDER}
                  </p>
                  <div className="detail-actions">
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      aria-busy={busy || status === "correcting"}
                      onClick={() => void onCorrect()}
                    >
                      Correct assessment
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={busy}
                      onClick={() => {
                        setVoidBasisRevision(selected.aggregate_revision);
                        setConfirmVoid(true);
                      }}
                    >
                      Void assessment
                    </button>
                  </div>
                  {confirmVoid ? (
                    <div
                      className="confirm-box"
                      role="group"
                      aria-label="Confirm void ClassroomAssessment"
                    >
                      <p>
                        Void this ClassroomAssessment? VOID is terminal and not
                        the same as cancel. The record remains visible as
                        VOIDED history.
                      </p>
                      <div className="detail-actions">
                        <button
                          type="button"
                          className="btn btn-danger"
                          disabled={busy}
                          onClick={() => void onVoid()}
                        >
                          Confirm void
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() => {
                            setConfirmVoid(false);
                            setVoidBasisRevision(null);
                          }}
                        >
                          Keep recorded
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}

          <section className="panel" aria-labelledby="assess-history-heading">
            <h2 id="assess-history-heading">Classroom assessments</h2>
            <p className="muted">
              Server truth from LIST/GET. Browser refresh reloads these records.
              Local UI state is never Assessment authority.
            </p>
            {history.length === 0 ? (
              <EmptyState
                title="No ClassroomAssessments yet"
                description={
                  executionIdParam
                    ? "No durable class assessment is recorded for this lesson context yet."
                    : "Record a class assessment from a completed lesson, or open Teach to find one."
                }
              />
            ) : (
              <ul className="teach-card-list">
                {history.map((item) => (
                  <li key={item.assessment_id} className="teach-card">
                    <div className="teach-card-body">
                      <p>
                        <span
                          className="lifecycle-pill"
                          data-state={item.lifecycle_state}
                        >
                          {formatAssessmentLifecycleLabel(item.lifecycle_state)}
                        </span>{" "}
                        · {formatClassResultLevelLabel(item.class_result_level)}{" "}
                        · <code>{item.class_ref}</code>
                      </p>
                      <p className="muted">
                        Recorded {formatAssessmentInstant(item.recorded_at)}
                        {item.execution_id
                          ? ` · execution ${item.execution_id.slice(0, 8)}…`
                          : ""}
                      </p>
                      <p>
                        <Link
                          to={assessHrefForAssessment(item.assessment_id)}
                          onClick={(event) => {
                            event.preventDefault();
                            setSearchParams(
                              {
                                ...(item.execution_id
                                  ? { execution_id: item.execution_id }
                                  : {}),
                                assessment_id: item.assessment_id,
                              },
                              { replace: false },
                            );
                          }}
                        >
                          Open assessment
                        </Link>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </article>
  );
}

function messageForAssessError(error: unknown): string {
  const code = problemCodeFromApiError(error);
  if (code === "assessment_capability_forbidden") {
    return "Assessment capability denied by current server authority.";
  }
  if (code === "school_context_unavailable") {
    return "School Context authority is temporarily unavailable.";
  }
  if (code === "authorization_unavailable") {
    return "Authorization is temporarily unavailable.";
  }
  return userMessageForApiError(error);
}
