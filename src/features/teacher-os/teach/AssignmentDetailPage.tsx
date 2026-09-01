import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  cancelTeachingAssignment,
  closeTeachingAssignment,
  getTeachingAssignment,
  updateTeachingAssignmentDue,
  type TeachingAssignmentResponse,
} from "@/services/api/teachingAssignmentsApi";
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
  artifactLinkForAssignment,
  formatAssignmentInstant,
  isActiveAssignment,
} from "./assignmentPresentation";
import "./teach.css";

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function datetimeLocalToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Assignment detail — mutations require fresh GET ETag.
 * CLOSED and CANCELLED are terminal; no reopen.
 */
export function AssignmentDetailPage() {
  const { assignmentId = "" } = useParams();
  const { isConnected, isProduction } = useSession();
  const [assignment, setAssignment] =
    useState<TeachingAssignmentResponse | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "unavailable"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [dueDraft, setDueDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const mutationInFlightRef = useRef(false);
  const dueKeyRef = useRef<string | null>(null);
  const dueMaterialRef = useRef<string | null>(null);
  const closeKeyRef = useRef<string | null>(null);
  const cancelKeyRef = useRef<string | null>(null);

  const load = useCallback(
    async (options?: { silent?: boolean; notice?: string }) => {
      if (!assignmentId) return;
      if (!isConnected && !isProduction) {
        setStatus("unavailable");
        return;
      }
      if (!options?.silent) setStatus("loading");
      setErrorMessage("");
      try {
        const response = await getTeachingAssignment(assignmentId);
        setAssignment(response.data);
        setEtag(response.etag);
        setDueDraft(toDatetimeLocalValue(response.data.due_at));
        setStatus("ready");
        if (options?.notice) {
          setActionMessage(options.notice);
        }
      } catch (error) {
        setErrorMessage(userMessageForApiError(error));
        setStatus("error");
      }
    },
    [assignmentId, isConnected, isProduction],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function ensureFreshEtag(): Promise<string | null> {
    if (etag) return etag;
    const response = await getTeachingAssignment(assignmentId);
    setAssignment(response.data);
    setEtag(response.etag);
    setDueDraft(toDatetimeLocalValue(response.data.due_at));
    return response.etag;
  }

  async function onUpdateDue() {
    if (!assignment || mutationInFlightRef.current) return;
    if (!isActiveAssignment(assignment)) return;

    const dueIso = datetimeLocalToIso(dueDraft);
    const material = JSON.stringify({ due_at: dueIso });
    if (dueMaterialRef.current !== material) {
      dueKeyRef.current = null;
      dueMaterialRef.current = material;
    }
    if (!dueKeyRef.current) {
      dueKeyRef.current = crypto.randomUUID();
    }

    mutationInFlightRef.current = true;
    setBusy(true);
    setActionMessage("Updating due date…");
    try {
      const currentEtag = await ensureFreshEtag();
      if (!currentEtag) {
        setActionMessage(
          "Missing ETag from Assignment GET (client contract error). Reloaded.",
        );
        await load({ silent: true });
        return;
      }
      const response = await updateTeachingAssignmentDue(
        assignment.assignment_id,
        { due_at: dueIso },
        currentEtag,
        dueKeyRef.current,
      );
      dueKeyRef.current = null;
      dueMaterialRef.current = null;
      setAssignment(response.data);
      setEtag(response.etag);
      setDueDraft(toDatetimeLocalValue(response.data.due_at));
      setActionMessage("Due date updated.");
    } catch (error) {
      if (error instanceof ApiError && error.code === "precondition_failed") {
        await load({
          silent: true,
          notice:
            "This Assignment changed since you loaded it. Latest state was reloaded — review before updating again.",
        });
      } else if (
        error instanceof ApiError &&
        error.code === "precondition_required"
      ) {
        await load({
          silent: true,
          notice:
            "If-Match was missing (client contract error). Latest Assignment state was reloaded.",
        });
      } else {
        const problemCode = problemCodeFromApiError(error);
        if (
          problemCode === "teaching_assignment_not_active" ||
          problemCode === "idempotency_key_reused"
        ) {
          await load({
            silent: true,
            notice: `${userMessageForApiError(error)} Latest state was reloaded.`,
          });
        } else {
          setActionMessage(userMessageForApiError(error));
        }
      }
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function onClose() {
    if (!assignment || mutationInFlightRef.current) return;
    if (!isActiveAssignment(assignment)) return;
    if (!closeKeyRef.current) {
      closeKeyRef.current = crypto.randomUUID();
    }

    mutationInFlightRef.current = true;
    setBusy(true);
    setActionMessage("Closing assignment…");
    try {
      const currentEtag = await ensureFreshEtag();
      if (!currentEtag) {
        setActionMessage(
          "Missing ETag from Assignment GET (client contract error). Reloaded.",
        );
        await load({ silent: true });
        return;
      }
      const response = await closeTeachingAssignment(
        assignment.assignment_id,
        currentEtag,
        closeKeyRef.current,
      );
      closeKeyRef.current = null;
      setConfirmClose(false);
      setAssignment(response.data);
      setEtag(response.etag);
      setActionMessage("Assignment closed.");
    } catch (error) {
      if (error instanceof ApiError && error.code === "precondition_failed") {
        setConfirmClose(false);
        await load({
          silent: true,
          notice:
            "This Assignment changed since you loaded it. Latest state was reloaded — review before closing again.",
        });
      } else {
        setActionMessage(userMessageForApiError(error));
      }
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!assignment || mutationInFlightRef.current) return;
    if (!isActiveAssignment(assignment)) return;
    if (!cancelKeyRef.current) {
      cancelKeyRef.current = crypto.randomUUID();
    }

    mutationInFlightRef.current = true;
    setBusy(true);
    setActionMessage("Cancelling assignment…");
    try {
      const currentEtag = await ensureFreshEtag();
      if (!currentEtag) {
        setActionMessage(
          "Missing ETag from Assignment GET (client contract error). Reloaded.",
        );
        await load({ silent: true });
        return;
      }
      const response = await cancelTeachingAssignment(
        assignment.assignment_id,
        currentEtag,
        cancelKeyRef.current,
      );
      cancelKeyRef.current = null;
      setConfirmCancel(false);
      setAssignment(response.data);
      setEtag(response.etag);
      setActionMessage("Assignment cancelled.");
    } catch (error) {
      if (error instanceof ApiError && error.code === "precondition_failed") {
        setConfirmCancel(false);
        await load({
          silent: true,
          notice:
            "This Assignment changed since you loaded it. Latest state was reloaded — review before cancelling again.",
        });
      } else {
        setActionMessage(userMessageForApiError(error));
      }
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  }

  const active = assignment ? isActiveAssignment(assignment) : false;
  const artifactHref = assignment
    ? artifactLinkForAssignment(assignment)
    : null;

  return (
    <article className="stack teach-page">
      <header>
        <p className="muted">
          <Link to="/teacher-os/teach">Assignments</Link>
          {" · "}
          Detail
        </p>
        <h1>
          {assignment?.audience_display_label ??
            assignment?.class_ref ??
            "Assignment"}
        </h1>
      </header>

      <div className="status-region" aria-live="polite">
        {status === "loading" ? (
          <LoadingState label="Loading assignment…" />
        ) : null}
        {status === "unavailable" ? (
          <EmptyState
            title="Session required"
            description="Connect a DEV session to load this TeachingAssignment."
          />
        ) : null}
        {status === "error" ? (
          <ErrorState
            title="Could not load assignment"
            message={errorMessage}
            onRetry={() => void load()}
          />
        ) : null}
      </div>

      {status === "ready" && assignment ? (
        <>
          <section className="panel" aria-labelledby="assignment-facts-heading">
            <h2 id="assignment-facts-heading">Assignment</h2>
            <dl className="work-meta">
              <div>
                <dt>Lifecycle</dt>
                <dd>
                  <span
                    className="lifecycle-pill"
                    data-state={assignment.lifecycle_state}
                  >
                    {assignment.lifecycle_state}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Class</dt>
                <dd>
                  {assignment.audience_display_label ?? assignment.class_ref}
                </dd>
              </div>
              <div>
                <dt>Assigned</dt>
                <dd>{formatAssignmentInstant(assignment.assigned_at)}</dd>
              </div>
              <div>
                <dt>Available from</dt>
                <dd>{formatAssignmentInstant(assignment.available_from)}</dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd>{formatAssignmentInstant(assignment.due_at)}</dd>
              </div>
              {assignment.closed_at ? (
                <div>
                  <dt>Closed at</dt>
                  <dd>{formatAssignmentInstant(assignment.closed_at)}</dd>
                </div>
              ) : null}
              {assignment.cancelled_at ? (
                <div>
                  <dt>Cancelled at</dt>
                  <dd>{formatAssignmentInstant(assignment.cancelled_at)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Content</dt>
                <dd>
                  <code>{assignment.content_id}</code>
                </dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>
                  <code>{assignment.content_version_id}</code>
                </dd>
              </div>
              {assignment.source_work_id ? (
                <div>
                  <dt>Source work</dt>
                  <dd>
                    {artifactHref ? (
                      <Link to={artifactHref}>Open artifact</Link>
                    ) : (
                      <code>{assignment.source_work_id}</code>
                    )}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Revision</dt>
                <dd>{assignment.aggregate_revision}</dd>
              </div>
              <div>
                <dt>Assignment ID</dt>
                <dd>
                  <code>{assignment.assignment_id}</code>
                </dd>
              </div>
            </dl>
            <p className="muted">
              Creating or updating an Assignment does not imply learner
              delivery, LMS publish, roster snapshot, or grading.
            </p>
          </section>

          {active ? (
            <section
              className="panel"
              aria-labelledby="assignment-actions-heading"
            >
              <h2 id="assignment-actions-heading">Actions</h2>

              <div className="assign-form">
                <label className="assign-field">
                  <span>Due date</span>
                  <input
                    type="datetime-local"
                    value={dueDraft}
                    onChange={(event) => setDueDraft(event.target.value)}
                    disabled={busy}
                  />
                </label>
                <div className="detail-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    aria-busy={busy}
                    onClick={() => void onUpdateDue()}
                  >
                    Update due date
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => {
                      setDueDraft("");
                    }}
                  >
                    Clear due field
                  </button>
                </div>
              </div>

              <div className="detail-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    setConfirmClose(true);
                    setConfirmCancel(false);
                    closeKeyRef.current = null;
                  }}
                >
                  Close assignment
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => {
                    setConfirmCancel(true);
                    setConfirmClose(false);
                    cancelKeyRef.current = null;
                  }}
                >
                  Cancel assignment
                </button>
              </div>

              {confirmClose ? (
                <div className="confirm-box" role="group" aria-label="Confirm close">
                  <p>
                    Close this assignment? Closed is terminal — due edits and
                    cancel will no longer be available.
                  </p>
                  <div className="detail-actions">
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => void onClose()}
                    >
                      Confirm close
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => setConfirmClose(false)}
                    >
                      Keep active
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
                    Cancel this assignment? Cancelled is terminal — due edits and
                    close will no longer be available.
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
                      Keep active
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="panel">
              <h2>Actions</h2>
              <p className="muted">
                This Assignment is {assignment.lifecycle_state}. Due update,
                close, cancel, and reopen are not available.
              </p>
            </section>
          )}

          <p className="status-region" role="status" aria-live="assertive">
            {actionMessage}
          </p>
        </>
      ) : null}
    </article>
  );
}
