import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  cancelTeachingExecution,
  completeTeachingExecution,
  correctTeachingExecutionObservation,
  createTeachingExecutionObservation,
  getTeachingExecution,
  type TeachingExecutionObservationResponse,
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
  executionLifecycleMaterial,
  observationCorrectMaterial,
  observationCreateMaterial,
  retainOrMintIdempotencyKey,
} from "./executionIdempotency";
import {
  fetchFreshExecutionForMutation,
  MissingExecutionEtagError,
} from "./executionMutationPreconditions";
import {
  formatExecutionInstant,
  formatExecutionLifecycleLabel,
  formatObservationKindLabel,
  isAllowedObservationKind,
  isExecutionInProgress,
  isExecutionTerminal,
  OBSERVATION_KINDS,
  observationRevisionEtag,
  type ObservationKind,
} from "./executionPresentation";
import "./teach.css";

const TERMINAL_STATE_NOTICE =
  "Latest state was loaded. This TeachingExecution is no longer in progress.";

const ASSIGNMENT_INDEPENDENT_COPY =
  "Completing or cancelling this lesson does not mutate related TeachingAssignments. Assigned ≠ Taught ≠ Assessed ≠ Mastered.";

/**
 * TeachingExecution detail — observations and complete/cancel while IN_PROGRESS.
 * Terminal states are read-only. Observation kinds are PRIVATE_EXECUTION_NOTE
 * and CLASS_OBSERVATION only — no learner fields.
 */
export function ExecutionDetailPage() {
  const { executionId = "" } = useParams();
  const { isConnected, isProduction } = useSession();
  const [execution, setExecution] = useState<TeachingExecutionResponse | null>(
    null,
  );
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "unavailable"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const [observationKind, setObservationKind] =
    useState<ObservationKind>("PRIVATE_EXECUTION_NOTE");
  const [observationBody, setObservationBody] = useState("");
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctDraft, setCorrectDraft] = useState("");

  const mutationInFlightRef = useRef(false);
  const createKeyRef = useRef<string | null>(null);
  const createMaterialRef = useRef<string | null>(null);
  const correctKeyRef = useRef<string | null>(null);
  const correctMaterialRef = useRef<string | null>(null);
  const completeKeyRef = useRef<string | null>(null);
  const completeMaterialRef = useRef<string | null>(null);
  const cancelKeyRef = useRef<string | null>(null);
  const cancelMaterialRef = useRef<string | null>(null);

  const load = useCallback(
    async (options?: { silent?: boolean; notice?: string }) => {
      if (!executionId) return;
      if (!isConnected && !isProduction) {
        setStatus("unavailable");
        return;
      }
      if (!options?.silent) setStatus("loading");
      setErrorMessage("");
      try {
        const response = await getTeachingExecution(executionId);
        setExecution(response.data);
        setStatus("ready");
        if (options?.notice) {
          setActionMessage(options.notice);
        }
      } catch (error) {
        const problemCode = problemCodeFromApiError(error);
        if (
          problemCode === "class_ref_not_assignable" ||
          (error instanceof ApiError && error.code === "forbidden")
        ) {
          setErrorMessage(
            "Access denied for this TeachingExecution ClassRef. Failed closed.",
          );
        } else {
          setErrorMessage(userMessageForApiError(error));
        }
        setStatus("error");
      }
    },
    [executionId, isConnected, isProduction],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function applyFreshExecution(
    fresh: Awaited<ReturnType<typeof fetchFreshExecutionForMutation>>,
  ) {
    setExecution(fresh.execution);
  }

  async function prepareInProgressMutation(): Promise<Awaited<
    ReturnType<typeof fetchFreshExecutionForMutation>
  > | null> {
    try {
      const fresh = await fetchFreshExecutionForMutation(executionId);
      applyFreshExecution(fresh);
      if (!isExecutionInProgress(fresh.execution)) {
        setConfirmComplete(false);
        setConfirmCancel(false);
        setCorrectingId(null);
        setActionMessage(TERMINAL_STATE_NOTICE);
        return null;
      }
      return fresh;
    } catch (error) {
      if (error instanceof MissingExecutionEtagError) {
        setActionMessage(
          "Missing ETag from Execution GET (client contract error).",
        );
        return null;
      }
      setActionMessage(userMessageForApiError(error));
      return null;
    }
  }

  async function handleMutationError(
    error: unknown,
    options?: {
      resetConfirm?: boolean;
      invalidate?: "create" | "correct" | "complete" | "cancel";
    },
  ) {
    if (options?.resetConfirm) {
      setConfirmComplete(false);
      setConfirmCancel(false);
    }
    const problemCode = problemCodeFromApiError(error);
    const isRevisionConflict =
      error instanceof ApiError &&
      (error.code === "precondition_failed" ||
        problemCode === "resource_revision_conflict" ||
        problemCode === "teaching_execution_observation_revision_conflict");
    if (isRevisionConflict) {
      if (options?.invalidate === "create") {
        clearIdempotencyAssociation(createKeyRef, createMaterialRef);
      } else if (options?.invalidate === "correct") {
        clearIdempotencyAssociation(correctKeyRef, correctMaterialRef);
      } else if (options?.invalidate === "complete") {
        clearIdempotencyAssociation(completeKeyRef, completeMaterialRef);
      } else if (options?.invalidate === "cancel") {
        clearIdempotencyAssociation(cancelKeyRef, cancelMaterialRef);
      }
      await load({
        silent: true,
        notice:
          "This TeachingExecution changed since you loaded it. Latest state was reloaded — review before trying again.",
      });
      return;
    }
    if (error instanceof ApiError && error.code === "precondition_required") {
      await load({
        silent: true,
        notice:
          "If-Match was missing (client contract error). Latest Execution state was reloaded.",
      });
      return;
    }
    if (
      problemCode === "teaching_execution_not_in_progress" ||
      problemCode === "idempotency_key_reused"
    ) {
      await load({
        silent: true,
        notice: `${userMessageForApiError(error)} Latest state was reloaded.`,
      });
      return;
    }
    if (
      problemCode === "class_ref_not_assignable" ||
      (error instanceof ApiError && error.code === "forbidden")
    ) {
      setActionMessage(
        "ClassRef authorization failed closed. No further mutation was applied.",
      );
      return;
    }
    if (
      problemCode === "school_context_unavailable" ||
      (error instanceof ApiError && error.code === "unavailable")
    ) {
      setActionMessage(
        "Service temporarily unavailable (recoverable). Retry preserves the same Idempotency-Key for this deliberate attempt.",
      );
      return;
    }
    setActionMessage(userMessageForApiError(error));
  }

  async function onCreateObservation() {
    if (!execution || mutationInFlightRef.current) return;
    if (!isExecutionInProgress(execution)) return;
    if (!isAllowedObservationKind(observationKind)) return;
    const body = observationBody.trim();
    if (!body) {
      setActionMessage("Enter observation text before recording.");
      return;
    }

    mutationInFlightRef.current = true;
    setBusy(true);
    setActionMessage("Recording observation…");
    try {
      const fresh = await prepareInProgressMutation();
      if (!fresh) return;
      const material = observationCreateMaterial({
        executionId: fresh.execution.execution_id,
        observationKind,
        body,
      });
      const idempotencyKey = retainOrMintIdempotencyKey(
        material,
        createKeyRef,
        createMaterialRef,
      );
      await createTeachingExecutionObservation(
        fresh.execution.execution_id,
        { observation_kind: observationKind, body },
        idempotencyKey,
      );
      clearIdempotencyAssociation(createKeyRef, createMaterialRef);
      setObservationBody("");
      await load({ silent: true, notice: "Observation recorded." });
    } catch (error) {
      await handleMutationError(error, { invalidate: "create" });
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function onCorrectObservation(observationId: string) {
    if (!execution || mutationInFlightRef.current) return;
    if (!isExecutionInProgress(execution)) return;
    const body = correctDraft.trim();
    if (!body) {
      setActionMessage("Enter corrected observation text.");
      return;
    }

    mutationInFlightRef.current = true;
    setBusy(true);
    setActionMessage("Correcting observation…");
    try {
      const fresh = await prepareInProgressMutation();
      if (!fresh) return;
      const observation = (fresh.execution.observations ?? []).find(
        (item) => item.observation_id === observationId,
      );
      if (!observation) {
        clearIdempotencyAssociation(correctKeyRef, correctMaterialRef);
        setActionMessage(
          "Observation was not found on the latest Execution. Latest state was reloaded.",
        );
        setCorrectingId(null);
        return;
      }
      const material = observationCorrectMaterial({
        executionId: fresh.execution.execution_id,
        observationId,
        expectedRevision: observation.revision,
        body,
      });
      const idempotencyKey = retainOrMintIdempotencyKey(
        material,
        correctKeyRef,
        correctMaterialRef,
      );
      await correctTeachingExecutionObservation(
        fresh.execution.execution_id,
        observationId,
        { body },
        observationRevisionEtag(observation),
        idempotencyKey,
      );
      clearIdempotencyAssociation(correctKeyRef, correctMaterialRef);
      setCorrectingId(null);
      setCorrectDraft("");
      await load({ silent: true, notice: "Observation corrected." });
    } catch (error) {
      await handleMutationError(error, { invalidate: "correct" });
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function onComplete() {
    if (!execution || mutationInFlightRef.current) return;
    if (!isExecutionInProgress(execution)) return;

    mutationInFlightRef.current = true;
    setBusy(true);
    setActionMessage("Completing lesson…");
    try {
      const fresh = await prepareInProgressMutation();
      if (!fresh) return;
      const material = executionLifecycleMaterial({
        executionId: fresh.execution.execution_id,
        expectedAggregateRevision: fresh.execution.aggregate_revision,
        action: "complete",
      });
      const idempotencyKey = retainOrMintIdempotencyKey(
        material,
        completeKeyRef,
        completeMaterialRef,
      );
      const response = await completeTeachingExecution(
        fresh.execution.execution_id,
        fresh.etag,
        idempotencyKey,
      );
      clearIdempotencyAssociation(completeKeyRef, completeMaterialRef);
      setConfirmComplete(false);
      setExecution(response.data);
      setActionMessage(
        `Lesson completed. ${ASSIGNMENT_INDEPENDENT_COPY}`,
      );
    } catch (error) {
      await handleMutationError(error, {
        resetConfirm: true,
        invalidate: "complete",
      });
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!execution || mutationInFlightRef.current) return;
    if (!isExecutionInProgress(execution)) return;

    mutationInFlightRef.current = true;
    setBusy(true);
    setActionMessage("Cancelling lesson…");
    try {
      const fresh = await prepareInProgressMutation();
      if (!fresh) return;
      const material = executionLifecycleMaterial({
        executionId: fresh.execution.execution_id,
        expectedAggregateRevision: fresh.execution.aggregate_revision,
        action: "cancel",
      });
      const idempotencyKey = retainOrMintIdempotencyKey(
        material,
        cancelKeyRef,
        cancelMaterialRef,
      );
      const response = await cancelTeachingExecution(
        fresh.execution.execution_id,
        fresh.etag,
        idempotencyKey,
      );
      clearIdempotencyAssociation(cancelKeyRef, cancelMaterialRef);
      setConfirmCancel(false);
      setExecution(response.data);
      setActionMessage(
        `Lesson cancelled. ${ASSIGNMENT_INDEPENDENT_COPY}`,
      );
    } catch (error) {
      await handleMutationError(error, {
        resetConfirm: true,
        invalidate: "cancel",
      });
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  }

  const inProgress = execution ? isExecutionInProgress(execution) : false;
  const terminal = execution ? isExecutionTerminal(execution) : false;
  const observations: TeachingExecutionObservationResponse[] =
    execution?.observations ?? [];

  return (
    <article className="stack teach-page">
      <header>
        <p className="muted">
          <Link to="/teacher-os/teach">Teach</Link>
          {" · "}
          Execution
        </p>
        <h1>
          {execution
            ? formatExecutionLifecycleLabel(execution.lifecycle_state)
            : "Teaching execution"}
        </h1>
        <p className="muted">
          Assigned ≠ Taught ≠ Assessed ≠ Mastered. Completing a lesson means the
          teacher finished teaching — not assignment complete, learner receipt,
          attendance, assessment, or mastery.
        </p>
      </header>

      <div className="status-region" aria-live="polite">
        {status === "loading" ? (
          <LoadingState label="Loading teaching execution…" />
        ) : null}
        {status === "unavailable" ? (
          <EmptyState
            title="Session required"
            description="Connect a DEV session to load this TeachingExecution."
          />
        ) : null}
        {status === "error" ? (
          <ErrorState
            title="Could not load teaching execution"
            message={errorMessage}
            onRetry={() => void load()}
          />
        ) : null}
      </div>

      {status === "ready" && execution ? (
        <>
          <section
            className="panel"
            aria-labelledby="execution-facts-heading"
          >
            <h2 id="execution-facts-heading">Execution</h2>
            <dl className="work-meta">
              <div>
                <dt>Lifecycle</dt>
                <dd>
                  <span
                    className="lifecycle-pill"
                    data-state={execution.lifecycle_state}
                  >
                    {formatExecutionLifecycleLabel(execution.lifecycle_state)}{" "}
                    ({execution.lifecycle_state})
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
                  <Link to={`/teacher-os/work/${execution.work_id}`}>
                    <code>{execution.work_id}</code>
                  </Link>
                </dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{formatExecutionInstant(execution.started_at)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatExecutionInstant(execution.updated_at)}</dd>
              </div>
              {execution.completed_at ? (
                <div>
                  <dt>Completed</dt>
                  <dd>{formatExecutionInstant(execution.completed_at)}</dd>
                </div>
              ) : null}
              {execution.cancelled_at ? (
                <div>
                  <dt>Cancelled</dt>
                  <dd>{formatExecutionInstant(execution.cancelled_at)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Aggregate revision</dt>
                <dd>{execution.aggregate_revision}</dd>
              </div>
              <div>
                <dt>Execution ID</dt>
                <dd>
                  <code>{execution.execution_id}</code>
                </dd>
              </div>
            </dl>
            <p className="muted">{ASSIGNMENT_INDEPENDENT_COPY}</p>
          </section>

          <section
            className="panel"
            aria-labelledby="execution-bindings-heading"
          >
            <h2 id="execution-bindings-heading">Content bindings</h2>
            {execution.bindings.length === 0 ? (
              <p className="muted">No content versions were bound.</p>
            ) : (
              <ul className="teach-list">
                {execution.bindings.map((binding) => (
                  <li
                    key={`${binding.content_id}:${binding.content_version_id}:${binding.artifact_kind}`}
                  >
                    <dl className="work-meta">
                      <div>
                        <dt>Kind</dt>
                        <dd>{binding.artifact_kind}</dd>
                      </div>
                      <div>
                        <dt>Content</dt>
                        <dd>
                          <code>{binding.content_id}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>Version</dt>
                        <dd>
                          <code>{binding.content_version_id}</code>
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className="panel"
            aria-labelledby="execution-observations-heading"
          >
            <h2 id="execution-observations-heading">Observations</h2>
            <p className="muted">
              Observation kinds are Private execution note and Class observation
              only. Learner-specific fields are not supported.
            </p>

            {observations.length === 0 ? (
              <p className="muted">No observations recorded yet.</p>
            ) : (
              <ul className="teach-list">
                {observations.map((observation) => (
                  <li key={observation.observation_id}>
                    <section className="panel teach-card">
                      <div className="teach-card-header">
                        <h3>
                          {formatObservationKindLabel(
                            observation.observation_kind,
                          )}
                        </h3>
                        <span className="muted">
                          rev {observation.revision}
                        </span>
                      </div>
                      <p>{observation.body}</p>
                      <p className="muted">
                        Recorded{" "}
                        {formatExecutionInstant(observation.recorded_at)}
                        {" · "}
                        Updated{" "}
                        {formatExecutionInstant(observation.updated_at)}
                      </p>
                      {inProgress ? (
                        correctingId === observation.observation_id ? (
                          <div className="assign-form">
                            <label className="assign-field">
                              <span>Corrected text</span>
                              <textarea
                                value={correctDraft}
                                onChange={(event) =>
                                  setCorrectDraft(event.target.value)
                                }
                                rows={3}
                                disabled={busy}
                                aria-label="Corrected observation text"
                              />
                            </label>
                            <div className="detail-actions">
                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                onClick={() =>
                                  void onCorrectObservation(
                                    observation.observation_id,
                                  )
                                }
                              >
                                Save correction
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={busy}
                                onClick={() => {
                                  setCorrectingId(null);
                                  setCorrectDraft("");
                                  correctKeyRef.current = null;
                                }}
                              >
                                Cancel edit
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={busy}
                            onClick={() => {
                              setCorrectingId(observation.observation_id);
                              setCorrectDraft(observation.body);
                              correctKeyRef.current = null;
                              correctMaterialRef.current = null;
                            }}
                          >
                            Correct
                          </button>
                        )
                      ) : null}
                    </section>
                  </li>
                ))}
              </ul>
            )}

            {inProgress ? (
              <div className="assign-form">
                <h3>Add observation</h3>
                <label className="assign-field">
                  <span>Kind</span>
                  <select
                    value={observationKind}
                    onChange={(event) =>
                      setObservationKind(event.target.value as ObservationKind)
                    }
                    disabled={busy}
                    aria-label="Observation kind"
                  >
                    {OBSERVATION_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {formatObservationKindLabel(kind)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="assign-field">
                  <span>Note</span>
                  <textarea
                    value={observationBody}
                    onChange={(event) =>
                      setObservationBody(event.target.value)
                    }
                    rows={4}
                    disabled={busy}
                    aria-label="Observation note"
                  />
                </label>
                <div className="detail-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    aria-busy={busy}
                    onClick={() => void onCreateObservation()}
                  >
                    Record observation
                  </button>
                </div>
              </div>
            ) : terminal ? (
              <p className="muted">
                This execution is {execution.lifecycle_state}. Observations are
                read-only — new notes, corrections, complete, and cancel are not
                available.
              </p>
            ) : null}
          </section>

          {inProgress ? (
            <section
              className="panel"
              aria-labelledby="execution-actions-heading"
            >
              <h2 id="execution-actions-heading">Lesson actions</h2>
              <p className="muted">
                Complete records that you finished teaching this lesson. Cancel
                abandons an in-progress lesson. Neither action assesses learners
                or mutates assignments.
              </p>
              <div className="detail-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    setConfirmComplete(true);
                    setConfirmCancel(false);
                  }}
                >
                  Complete lesson
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => {
                    setConfirmCancel(true);
                    setConfirmComplete(false);
                  }}
                >
                  Cancel lesson
                </button>
              </div>

              {confirmComplete ? (
                <div
                  className="confirm-box"
                  role="group"
                  aria-label="Confirm complete"
                >
                  <p>
                    Complete this lesson? Completed is terminal — observations
                    become read-only. This does not close related assignments or
                    mark mastery.
                  </p>
                  <div className="detail-actions">
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => void onComplete()}
                    >
                      Confirm complete
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => setConfirmComplete(false)}
                    >
                      Keep in progress
                    </button>
                  </div>
                </div>
              ) : null}

              {confirmCancel ? (
                <div
                  className="confirm-box"
                  role="group"
                  aria-label="Confirm cancel"
                >
                  <p>
                    Cancel this lesson? Cancelled is terminal — observations
                    become read-only. Related assignments are not changed.
                  </p>
                  <div className="detail-actions">
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={busy}
                      onClick={() => void onCancel()}
                    >
                      Confirm cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => setConfirmCancel(false)}
                    >
                      Keep in progress
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <p className="status-region" role="status" aria-live="assertive">
            {actionMessage}
          </p>
        </>
      ) : null}
    </article>
  );
}
