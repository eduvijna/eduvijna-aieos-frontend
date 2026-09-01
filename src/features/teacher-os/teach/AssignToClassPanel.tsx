import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  createTeachingAssignment,
  listAssignableClasses,
  type SchoolContextClassItem,
  type TeachingAssignmentResponse,
} from "@/services/api/teachingAssignmentsApi";
import {
  ApiError,
  problemCodeFromApiError,
  userMessageForApiError,
} from "@/shared/errors/ApiError";
import { ErrorState } from "@/shared/components/ErrorState";
import { LoadingState } from "@/shared/components/LoadingState";
import "./teach.css";

export type AssignFormMaterial = {
  classRef: string;
  availableFrom: string;
  dueAt: string;
};

function datetimeLocalToIso(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function formatDisplay(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type AssignToClassPanelProps = {
  contentId: string;
  contentVersionId: string;
  sourceWorkId?: string | null;
  onClose: () => void;
};

/**
 * Assign-to-class panel. Submits only class_ref + exact content binding.
 * Display labels are provider-derived; never submitted.
 */
export function AssignToClassPanel({
  contentId,
  contentVersionId,
  sourceWorkId,
  onClose,
}: AssignToClassPanelProps) {
  const [classes, setClasses] = useState<SchoolContextClassItem[]>([]);
  const [loadStatus, setLoadStatus] = useState<
    "loading" | "ready" | "error" | "unavailable"
  >("loading");
  const [loadError, setLoadError] = useState("");
  const [classRef, setClassRef] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [created, setCreated] = useState<TeachingAssignmentResponse | null>(
    null,
  );
  const inFlightRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const materialFingerprintRef = useRef<string | null>(null);

  const materialFingerprint = useMemo(
    () =>
      JSON.stringify({
        classRef: classRef.trim(),
        availableFrom: availableFrom.trim(),
        dueAt: dueAt.trim(),
      } satisfies AssignFormMaterial),
    [classRef, availableFrom, dueAt],
  );

  const loadClasses = useCallback(async () => {
    setLoadStatus("loading");
    setLoadError("");
    try {
      const response = await listAssignableClasses();
      setClasses(response.data.items);
      setLoadStatus("ready");
    } catch (error) {
      if (error instanceof ApiError && error.code === "unavailable") {
        setLoadStatus("unavailable");
        setLoadError(userMessageForApiError(error));
        return;
      }
      setLoadStatus("error");
      setLoadError(userMessageForApiError(error));
    }
  }, []);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlightRef.current || created) return;
    if (!classRef.trim()) {
      setStatusMessage("Select a class before creating an assignment.");
      return;
    }

    if (materialFingerprintRef.current !== materialFingerprint) {
      idempotencyKeyRef.current = null;
      materialFingerprintRef.current = materialFingerprint;
    }
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    inFlightRef.current = true;
    setSubmitting(true);
    setStatusMessage("Creating assignment…");
    try {
      const body: {
        content_id: string;
        content_version_id: string;
        class_ref: string;
        source_work_id?: string;
        available_from?: string;
        due_at?: string;
      } = {
        content_id: contentId,
        content_version_id: contentVersionId,
        class_ref: classRef.trim(),
      };
      if (sourceWorkId) {
        body.source_work_id = sourceWorkId;
      }
      const availableIso = datetimeLocalToIso(availableFrom);
      if (availableIso) {
        body.available_from = availableIso;
      }
      const dueIso = datetimeLocalToIso(dueAt);
      if (dueIso) {
        body.due_at = dueIso;
      }

      const response = await createTeachingAssignment(
        body,
        idempotencyKeyRef.current,
      );
      idempotencyKeyRef.current = null;
      materialFingerprintRef.current = null;
      setCreated(response.data);
      setStatusMessage("Assignment created");
    } catch (error) {
      const problemCode = problemCodeFromApiError(error);
      if (problemCode === "class_ref_not_assignable") {
        setStatusMessage(
          "That class is no longer assignable. Reloaded current class choices — select again.",
        );
        setClassRef("");
        idempotencyKeyRef.current = null;
        materialFingerprintRef.current = null;
        await loadClasses();
      } else if (error instanceof ApiError && error.code === "unavailable") {
        setStatusMessage(
          "School Context is temporarily unavailable. Assignment was not created. Retry later.",
        );
      } else {
        setStatusMessage(userMessageForApiError(error));
      }
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <section
        className="panel assign-panel"
        aria-labelledby="assign-success-heading"
      >
        <h2 id="assign-success-heading">Assignment created</h2>
        <p className="muted">
          The TeachingAssignment is recorded in AIEOS. This does not mean
          learners received it, an LMS delivered it, or attempts exist.
        </p>
        <dl className="work-meta">
          <div>
            <dt>Class</dt>
            <dd>{created.audience_display_label ?? created.class_ref}</dd>
          </div>
          <div>
            <dt>Lifecycle</dt>
            <dd>{created.lifecycle_state}</dd>
          </div>
          <div>
            <dt>Assigned</dt>
            <dd>{formatDisplay(created.assigned_at)}</dd>
          </div>
          <div>
            <dt>Available from</dt>
            <dd>{formatDisplay(created.available_from)}</dd>
          </div>
          <div>
            <dt>Due</dt>
            <dd>{formatDisplay(created.due_at)}</dd>
          </div>
          <div>
            <dt>Assignment</dt>
            <dd>
              <code>{created.assignment_id}</code>
            </dd>
          </div>
        </dl>
        <div className="work-actions">
          <Link
            className="btn"
            to={`/teacher-os/teach/assignments/${created.assignment_id}`}
          >
            View in Teach
          </Link>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="status-region" role="status" aria-live="polite">
          {statusMessage}
        </p>
      </section>
    );
  }

  return (
    <section
      className="panel assign-panel"
      aria-labelledby="assign-form-heading"
    >
      <h2 id="assign-form-heading">Assign to class</h2>
      <p className="muted">
        Creates a TeachingAssignment for this exact published version. Not
        delivery, notification, or LMS publish.
      </p>

      <div className="status-region" aria-live="polite">
        {loadStatus === "loading" ? (
          <LoadingState label="Loading assignable classes…" />
        ) : null}
        {loadStatus === "unavailable" || loadStatus === "error" ? (
          <ErrorState
            title={
              loadStatus === "unavailable"
                ? "School Context unavailable"
                : "Could not load classes"
            }
            message={loadError}
            onRetry={() => void loadClasses()}
          />
        ) : null}
      </div>

      {loadStatus === "ready" ? (
        <form className="assign-form" onSubmit={(event) => void onSubmit(event)}>
          <label className="assign-field" htmlFor="assign-class-ref">
            <span>Class</span>
            <select
              id="assign-class-ref"
              required
              value={classRef}
              onChange={(event) => setClassRef(event.target.value)}
              disabled={submitting}
            >
              <option value="">Select a class</option>
              {classes.map((item) => (
                <option key={item.class_ref} value={item.class_ref}>
                  {item.display_label}
                </option>
              ))}
            </select>
          </label>

          <label className="assign-field">
            <span>Available from (optional)</span>
            <input
              type="datetime-local"
              value={availableFrom}
              onChange={(event) => setAvailableFrom(event.target.value)}
              disabled={submitting}
            />
          </label>

          <label className="assign-field">
            <span>Due (optional)</span>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              disabled={submitting}
            />
          </label>

          <div className="work-actions">
            <button
              type="submit"
              className="btn"
              disabled={submitting || !classRef}
              aria-busy={submitting}
            >
              Create assignment
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <p className="status-region" role="status" aria-live="assertive">
        {statusMessage}
      </p>
    </section>
  );
}
