import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  listAssignableClasses,
  listTeachingAssignments,
  type SchoolContextClassItem,
  type TeachingAssignmentResponse,
} from "@/services/api/teachingAssignmentsApi";
import {
  getTeachContext,
  startTeachingExecution,
  type TeacherOsTeachContextResponse,
  type TeachingExecutionContentBindingRequest,
} from "@/services/api/teachingExecutionsApi";
import { listTeachingWorks } from "@/services/api/teachingWorkApi";
import type { TeachingWork } from "@/services/api/generated/teachingTypes";
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
} from "./assignmentPresentation";
import {
  formatExecutionInstant,
  formatExecutionLifecycleLabel,
  isExecutionInProgress,
} from "./executionPresentation";
import "./teach.css";

type BindingKey = string;

function bindingKey(
  contentId: string,
  versionId: string,
  artifactKind: string,
): BindingKey {
  return `${contentId}:${versionId}:${artifactKind}`;
}

/**
 * Teach workspace — start TeachingExecutions from Work + ClassRef.
 * Assigned ≠ Taught ≠ Assessed ≠ Mastered. Completion of a lesson records
 * that the teacher finished teaching — not assignment complete, learner
 * receipt, attendance, assessment, or mastery.
 */
export function TeachPage() {
  const navigate = useNavigate();
  const { isConnected, isProduction } = useSession();
  const sessionReady = isConnected || isProduction;

  const [works, setWorks] = useState<TeachingWork[]>([]);
  const [classes, setClasses] = useState<SchoolContextClassItem[]>([]);
  const [assignments, setAssignments] = useState<TeachingAssignmentResponse[]>(
    [],
  );
  const [bootStatus, setBootStatus] = useState<
    "loading" | "ready" | "error" | "unavailable"
  >("loading");
  const [bootError, setBootError] = useState("");

  const [workId, setWorkId] = useState("");
  const [classRef, setClassRef] = useState("");

  const [context, setContext] = useState<TeacherOsTeachContextResponse | null>(
    null,
  );
  const [contextStatus, setContextStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [contextError, setContextError] = useState("");

  const [selectedBindings, setSelectedBindings] = useState<
    Record<BindingKey, TeachingExecutionContentBindingRequest>
  >({});
  const [startBusy, setStartBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const startInFlightRef = useRef(false);
  const startKeyRef = useRef<string | null>(null);
  const startMaterialRef = useRef<string | null>(null);

  const selectedWork = useMemo(
    () => works.find((work) => work.work_id === workId) ?? null,
    [works, workId],
  );

  const selectedClass = useMemo(
    () => classes.find((item) => item.class_ref === classRef) ?? null,
    [classes, classRef],
  );

  const startMaterialFingerprint = useMemo(() => {
    const bindings = Object.values(selectedBindings).sort((a, b) =>
      `${a.content_id}${a.content_version_id}${a.artifact_kind}`.localeCompare(
        `${b.content_id}${b.content_version_id}${b.artifact_kind}`,
      ),
    );
    return JSON.stringify({
      work_id: workId,
      class_ref: classRef,
      bindings,
    });
  }, [workId, classRef, selectedBindings]);

  const loadBootstrap = useCallback(async () => {
    if (!sessionReady) {
      setBootStatus("unavailable");
      return;
    }
    setBootStatus("loading");
    setBootError("");
    try {
      const [worksResponse, classesResponse, assignmentsResponse] =
        await Promise.all([
          listTeachingWorks({ limit: 50 }),
          listAssignableClasses(),
          listTeachingAssignments(),
        ]);
      setWorks(worksResponse.data.items ?? []);
      setClasses(classesResponse.data.items ?? []);
      setAssignments(assignmentsResponse.data.items ?? []);
      setBootStatus("ready");
    } catch (error) {
      if (error instanceof ApiError && error.code === "unavailable") {
        setBootStatus("unavailable");
        setBootError(userMessageForApiError(error));
        return;
      }
      setBootError(userMessageForApiError(error));
      setBootStatus("error");
    }
  }, [sessionReady]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  const loadContext = useCallback(async () => {
    if (!workId || !classRef) {
      setContext(null);
      setContextStatus("idle");
      setSelectedBindings({});
      return;
    }
    setContextStatus("loading");
    setContextError("");
    setActionMessage("");
    try {
      const response = await getTeachContext(workId, classRef);
      setContext(response.data);
      setSelectedBindings({});
      setContextStatus("ready");
    } catch (error) {
      setContext(null);
      setSelectedBindings({});
      const problemCode = problemCodeFromApiError(error);
      if (
        problemCode === "class_ref_not_assignable" ||
        (error instanceof ApiError && error.code === "forbidden")
      ) {
        setContextError(
          "This class is not currently assignable for your session. ClassRef authorization failed closed — choose another class or reconnect.",
        );
      } else if (problemCode === "school_context_unavailable") {
        setContextError(
          "School context is temporarily unavailable. Retry when the provider recovers.",
        );
      } else {
        setContextError(userMessageForApiError(error));
      }
      setContextStatus("error");
    }
  }, [workId, classRef]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  function toggleBinding(
    artifact: TeacherOsTeachContextResponse["artifacts"][number],
  ) {
    const kind = artifact.artifact_kind ?? artifact.content_type;
    const key = bindingKey(artifact.content_id, artifact.version_id, kind);
    setSelectedBindings((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return {
        ...prev,
        [key]: {
          content_id: artifact.content_id,
          content_version_id: artifact.version_id,
          artifact_kind: kind,
        },
      };
    });
  }

  async function onStartLesson() {
    if (!workId || !classRef || startInFlightRef.current) return;

    if (startMaterialRef.current !== startMaterialFingerprint) {
      startKeyRef.current = null;
      startMaterialRef.current = startMaterialFingerprint;
    }
    if (!startKeyRef.current) {
      startKeyRef.current = crypto.randomUUID();
    }

    startInFlightRef.current = true;
    setStartBusy(true);
    setActionMessage("Starting lesson…");
    try {
      const bindings = Object.values(selectedBindings);
      const response = await startTeachingExecution(
        {
          work_id: workId,
          class_ref: classRef,
          bindings,
        },
        startKeyRef.current,
      );
      startKeyRef.current = null;
      startMaterialRef.current = null;
      setActionMessage("Lesson started.");
      navigate(
        `/teacher-os/teach/executions/${response.data.execution_id}`,
      );
    } catch (error) {
      const problemCode = problemCodeFromApiError(error);
      if (
        problemCode === "class_ref_not_assignable" ||
        (error instanceof ApiError && error.code === "forbidden")
      ) {
        setActionMessage(
          "ClassRef is not assignable. Start failed closed — no TeachingExecution was created.",
        );
      } else if (problemCode === "content_version_mismatch") {
        setActionMessage(
          `${userMessageForApiError(error)} Reload the teach context and review bindings before starting again.`,
        );
        await loadContext();
      } else if (problemCode === "idempotency_key_reused") {
        setActionMessage(
          `${userMessageForApiError(error)} Change bindings or retry as a new deliberate start.`,
        );
        startKeyRef.current = null;
      } else if (
        problemCode === "school_context_unavailable" ||
        (error instanceof ApiError && error.code === "unavailable")
      ) {
        setActionMessage(
          "School context or service is temporarily unavailable. You can retry — the same Idempotency-Key is preserved for this attempt.",
        );
      } else {
        setActionMessage(userMessageForApiError(error));
      }
    } finally {
      startInFlightRef.current = false;
      setStartBusy(false);
    }
  }

  const inProgressExecutions =
    context?.executions.filter((item) => isExecutionInProgress(item)) ?? [];
  const otherExecutions =
    context?.executions.filter((item) => !isExecutionInProgress(item)) ?? [];

  return (
    <article className="stack teach-page">
      <header>
        <p className="muted">Teach</p>
        <h1>Teaching workspace</h1>
        <p className="muted">
          Assigned ≠ Taught ≠ Assessed ≠ Mastered. Starting or completing a
          lesson records teacher teaching activity — not assignment complete,
          learner receipt, attendance, assessment, or mastery.
        </p>
      </header>

      <div className="status-region" aria-live="polite">
        {bootStatus === "loading" ? (
          <LoadingState label="Loading teach workspace…" />
        ) : null}
        {bootStatus === "unavailable" ? (
          <EmptyState
            title="Session required"
            description={
              bootError ||
              "Connect a DEV session to load works, classes, and assignments."
            }
          />
        ) : null}
        {bootStatus === "error" ? (
          <ErrorState
            title="Could not load teach workspace"
            message={bootError}
            onRetry={() => void loadBootstrap()}
          />
        ) : null}
      </div>

      {bootStatus === "ready" ? (
        <>
          <section
            className="panel"
            aria-labelledby="teach-selectors-heading"
          >
            <h2 id="teach-selectors-heading">Select work and class</h2>
            <div className="teach-selectors">
              <label className="assign-field">
                <span>Teaching work</span>
                <select
                  value={workId}
                  onChange={(event) => setWorkId(event.target.value)}
                  aria-label="Teaching work"
                >
                  <option value="">Select a work…</option>
                  {works.map((work) => (
                    <option key={work.work_id} value={work.work_id}>
                      {[
                        work.goal_text,
                        work.subject,
                        work.topic,
                        work.target_date,
                        work.class_label,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="assign-field">
                <span>Class (advisory)</span>
                <select
                  value={classRef}
                  onChange={(event) => setClassRef(event.target.value)}
                  aria-label="Class"
                >
                  <option value="">Select a class…</option>
                  {classes.map((item) => (
                    <option key={item.class_ref} value={item.class_ref}>
                      {item.display_label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted">
              Class labels are advisory display only. Authorization uses opaque
              ClassRef at start time.
            </p>
            {selectedWork ? (
              <dl className="work-meta">
                <div>
                  <dt>Goal</dt>
                  <dd>{selectedWork.goal_text}</dd>
                </div>
                <div>
                  <dt>Subject</dt>
                  <dd>{selectedWork.subject ?? "—"}</dd>
                </div>
                <div>
                  <dt>Topic</dt>
                  <dd>{selectedWork.topic ?? "—"}</dd>
                </div>
                <div>
                  <dt>Target date</dt>
                  <dd>{selectedWork.target_date}</dd>
                </div>
                <div>
                  <dt>Class label</dt>
                  <dd>{selectedWork.class_label ?? "—"}</dd>
                </div>
              </dl>
            ) : null}
          </section>

          <div className="status-region" aria-live="polite">
            {contextStatus === "loading" ? (
              <LoadingState label="Loading teach context…" />
            ) : null}
            {contextStatus === "error" ? (
              <ErrorState
                title="Could not load teach context"
                message={contextError}
                onRetry={() => void loadContext()}
              />
            ) : null}
            {contextStatus === "idle" ? (
              <EmptyState
                title="Choose work and class"
                description="Select a TeachingWork and an authorized class to load teach context."
              />
            ) : null}
          </div>

          {contextStatus === "ready" && context ? (
            <>
              <section
                className="panel"
                aria-labelledby="teach-context-heading"
              >
                <h2 id="teach-context-heading">Teach context</h2>
                <dl className="work-meta">
                  <div>
                    <dt>Work goal</dt>
                    <dd>{context.work.goal_text}</dd>
                  </div>
                  <div>
                    <dt>Class</dt>
                    <dd>{context.display_label}</dd>
                  </div>
                  <div>
                    <dt>ClassRef</dt>
                    <dd>
                      <code>{context.class_ref}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Subject</dt>
                    <dd>{context.work.subject ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Topic</dt>
                    <dd>{context.work.topic ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Target date</dt>
                    <dd>{context.work.target_date}</dd>
                  </div>
                </dl>
              </section>

              <section
                className="panel"
                aria-labelledby="teach-artifacts-heading"
              >
                <h2 id="teach-artifacts-heading">Artifacts to bind</h2>
                <p className="muted">
                  Bind zero or more exact content versions for this lesson.
                  Bindings are evidence of what was taught — not assignment
                  delivery.
                </p>
                {context.artifacts.length === 0 ? (
                  <p className="muted">
                    No artifacts on this work yet. You can still start a lesson
                    with zero bindings.
                  </p>
                ) : (
                  <ul className="teach-binding-list">
                    {context.artifacts.map((artifact) => {
                      const kind =
                        artifact.artifact_kind ?? artifact.content_type;
                      const key = bindingKey(
                        artifact.content_id,
                        artifact.version_id,
                        kind,
                      );
                      const checked = Boolean(selectedBindings[key]);
                      const href = `/teacher-os/work/${context.work.work_id}/artifacts/${artifact.content_id}/versions/${artifact.version_id}`;
                      return (
                        <li key={key}>
                          <label className="teach-binding-item">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleBinding(artifact)}
                              aria-label={`Bind ${artifact.title}`}
                            />
                            <span>
                              <strong>{artifact.title}</strong>
                              <span className="muted">
                                {" "}
                                · {kind} · {artifact.stewardship_state}
                              </span>
                            </span>
                          </label>
                          <Link to={href} className="muted">
                            Open artifact
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="detail-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={startBusy}
                    aria-busy={startBusy}
                    onClick={() => void onStartLesson()}
                  >
                    Start lesson
                  </button>
                </div>
              </section>

              <section
                className="panel"
                aria-labelledby="teach-executions-heading"
              >
                <h2 id="teach-executions-heading">Executions</h2>
                {context.executions.length === 0 ? (
                  <p className="muted">No teaching executions for this pair yet.</p>
                ) : (
                  <ul className="teach-list">
                    {inProgressExecutions.map((item) => (
                      <li key={item.execution_id}>
                        <section className="panel teach-card teach-card-prominent">
                          <div className="teach-card-header">
                            <h3>
                              <Link
                                to={`/teacher-os/teach/executions/${item.execution_id}`}
                              >
                                In-progress lesson
                              </Link>
                            </h3>
                            <span
                              className="lifecycle-pill"
                              data-state={item.lifecycle_state}
                            >
                              {formatExecutionLifecycleLabel(
                                item.lifecycle_state,
                              )}{" "}
                              ({item.lifecycle_state})
                            </span>
                          </div>
                          <p className="muted">
                            Started {formatExecutionInstant(item.started_at)}
                          </p>
                        </section>
                      </li>
                    ))}
                    {otherExecutions.map((item) => (
                      <li key={item.execution_id}>
                        <section className="panel teach-card">
                          <div className="teach-card-header">
                            <h3>
                              <Link
                                to={`/teacher-os/teach/executions/${item.execution_id}`}
                              >
                                {formatExecutionLifecycleLabel(
                                  item.lifecycle_state,
                                )}
                              </Link>
                            </h3>
                            <span
                              className="lifecycle-pill"
                              data-state={item.lifecycle_state}
                            >
                              {item.lifecycle_state}
                            </span>
                          </div>
                          <p className="muted">
                            Started {formatExecutionInstant(item.started_at)}
                          </p>
                        </section>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section
                className="panel"
                aria-labelledby="teach-related-assignments-heading"
              >
                <h2 id="teach-related-assignments-heading">
                  Related assignments
                </h2>
                <p className="muted">
                  Assignment lifecycle is separate from teaching execution.
                  Completing a lesson does not close or cancel an assignment.
                </p>
                {context.assignments.length === 0 ? (
                  <p className="muted">
                    No related assignments for this work and class.
                  </p>
                ) : (
                  <ul className="teach-list">
                    {context.assignments.map((item) => (
                      <li key={item.assignment_id}>
                        <section className="panel teach-card">
                          <div className="teach-card-header">
                            <h3>
                              <Link
                                to={`/teacher-os/teach/assignments/${item.assignment_id}`}
                              >
                                {item.audience_display_label ?? item.class_ref}
                              </Link>
                            </h3>
                            <span
                              className="lifecycle-pill"
                              data-state={item.lifecycle_state}
                            >
                              {item.lifecycle_state}
                            </span>
                          </div>
                          <p className="muted">
                            Assigned {formatAssignmentInstant(item.assigned_at)}
                          </p>
                        </section>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}

          <section
            className="panel"
            aria-labelledby="assignment-records-heading"
          >
            <h2 id="assignment-records-heading">Assignment records</h2>
            <p className="muted">
              TeachingAssignments remain available for due/close/cancel. Creating
              an Assignment is not delivery, LMS publish, or learner receipt.
            </p>
            {assignments.length === 0 ? (
              <EmptyState
                title="No assignments yet"
                description="Assign a published worksheet, quiz, or homework from an Artifact page."
              />
            ) : (
              <ul className="teach-list">
                {assignments.map((item) => {
                  const artifactHref = artifactLinkForAssignment(item);
                  return (
                    <li key={item.assignment_id}>
                      <section className="panel teach-card">
                        <div className="teach-card-header">
                          <h3>
                            <Link
                              to={`/teacher-os/teach/assignments/${item.assignment_id}`}
                            >
                              {item.audience_display_label ?? item.class_ref}
                            </Link>
                          </h3>
                          <span
                            className="lifecycle-pill"
                            data-state={item.lifecycle_state}
                          >
                            {item.lifecycle_state}
                          </span>
                        </div>
                        <dl className="work-meta">
                          <div>
                            <dt>Assigned</dt>
                            <dd>
                              {formatAssignmentInstant(item.assigned_at)}
                            </dd>
                          </div>
                          <div>
                            <dt>Available from</dt>
                            <dd>
                              {formatAssignmentInstant(item.available_from)}
                            </dd>
                          </div>
                          <div>
                            <dt>Due</dt>
                            <dd>{formatAssignmentInstant(item.due_at)}</dd>
                          </div>
                          <div>
                            <dt>Content</dt>
                            <dd>
                              <code>{item.content_id}</code>
                            </dd>
                          </div>
                          <div>
                            <dt>Version</dt>
                            <dd>
                              <code>{item.content_version_id}</code>
                            </dd>
                          </div>
                          {item.source_work_id ? (
                            <div>
                              <dt>Source work</dt>
                              <dd>
                                {artifactHref ? (
                                  <Link to={artifactHref}>Open artifact</Link>
                                ) : (
                                  <code>{item.source_work_id}</code>
                                )}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      </section>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <p className="status-region" role="status" aria-live="assertive">
            {actionMessage}
          </p>
          {selectedClass ? (
            <p className="sr-only">
              Selected class display label: {selectedClass.display_label}
            </p>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
