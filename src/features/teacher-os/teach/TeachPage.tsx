import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listTeachingAssignments,
  type TeachingAssignmentResponse,
} from "@/services/api/teachingAssignmentsApi";
import { useSession } from "@/services/session/useSession";
import { userMessageForApiError } from "@/shared/errors/ApiError";
import { EmptyState } from "@/shared/components/EmptyState";
import { ErrorState } from "@/shared/components/ErrorState";
import { LoadingState } from "@/shared/components/LoadingState";
import { artifactLinkForAssignment, formatAssignmentInstant } from "./assignmentPresentation";
import "./teach.css";

/**
 * Teach surface — lists TeachingAssignments.
 * Creating an Assignment is not delivery, LMS publish, or learner receipt.
 */
export function TeachPage() {
  const { isConnected, isProduction } = useSession();
  const [items, setItems] = useState<TeachingAssignmentResponse[]>([]);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "unavailable"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    if (!isConnected && !isProduction) {
      setStatus("unavailable");
      return;
    }
    setStatus("loading");
    setErrorMessage("");
    try {
      const response = await listTeachingAssignments();
      setItems(response.data.items ?? []);
      setStatus("ready");
    } catch (error) {
      setErrorMessage(userMessageForApiError(error));
      setStatus("error");
    }
  }, [isConnected, isProduction]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <article className="stack teach-page">
      <header>
        <p className="muted">Teach</p>
        <h1>Assignments</h1>
        <p className="muted">
          TeachingAssignments recorded in AIEOS. Assigned does not mean
          delivered, attempted, or graded.
        </p>
      </header>

      <div className="status-region" aria-live="polite">
        {status === "loading" ? (
          <LoadingState label="Loading assignments…" />
        ) : null}
        {status === "unavailable" ? (
          <EmptyState
            title="Session required"
            description="Connect a DEV session to load TeachingAssignments."
          />
        ) : null}
        {status === "error" ? (
          <ErrorState
            title="Could not load assignments"
            message={errorMessage}
            onRetry={() => void load()}
          />
        ) : null}
      </div>

      {status === "ready" && items.length === 0 ? (
        <EmptyState
          title="No assignments yet"
          description="Assign a published worksheet, quiz, or homework from an Artifact page."
        />
      ) : null}

      {status === "ready" && items.length > 0 ? (
        <ul className="teach-list">
          {items.map((item) => {
            const artifactHref = artifactLinkForAssignment(item);
            return (
              <li key={item.assignment_id}>
                <section className="panel teach-card">
                  <div className="teach-card-header">
                    <h2>
                      <Link
                        to={`/teacher-os/teach/assignments/${item.assignment_id}`}
                      >
                        {item.audience_display_label ?? item.class_ref}
                      </Link>
                    </h2>
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
                      <dd>{formatAssignmentInstant(item.assigned_at)}</dd>
                    </div>
                    <div>
                      <dt>Available from</dt>
                      <dd>{formatAssignmentInstant(item.available_from)}</dd>
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
      ) : null}
    </article>
  );
}
