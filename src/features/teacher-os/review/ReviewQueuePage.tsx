import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listReviewQueue } from "@/services/api/reviewQueueApi";
import type { TeacherReviewQueueItem } from "@/services/api/generated/reviewTypes";
import { useSession } from "@/services/session/useSession";
import { userMessageForApiError } from "@/shared/errors/ApiError";
import { EmptyState } from "@/shared/components/EmptyState";
import { ErrorState } from "@/shared/components/ErrorState";
import { LoadingState } from "@/shared/components/LoadingState";
import "./review.css";

function formatSubmittedAt(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function ReviewQueuePage() {
  const { isConnected, isProduction } = useSession();
  const [items, setItems] = useState<TeacherReviewQueueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "unavailable"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const loadInitial = useCallback(async () => {
    if (!isConnected && !isProduction) {
      setStatus("unavailable");
      setItems([]);
      setNextCursor(null);
      return;
    }
    setStatus("loading");
    setErrorMessage("");
    try {
      const { data } = await listReviewQueue({ limit: 100 });
      setItems(data.items);
      setNextCursor(data.next_cursor);
      setStatus("ready");
    } catch (error) {
      setErrorMessage(userMessageForApiError(error));
      setStatus("error");
    }
  }, [isConnected, isProduction]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setErrorMessage("");
    try {
      const { data } = await listReviewQueue({
        limit: 100,
        cursor: nextCursor,
      });
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.next_cursor);
    } catch (error) {
      setErrorMessage(userMessageForApiError(error));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <article className="stack review-queue-page">
      <header>
        <p className="muted">
          <Link to="/teacher-os/today">Today</Link> · Review
        </p>
        <h1>Review Queue</h1>
        <p className="muted">
          Artifacts awaiting teacher judgment. Open an item to inspect payload
          and decide.
        </p>
      </header>

      <div className="status-region" aria-live="polite">
        {status === "loading" ? (
          <LoadingState label="Loading review queue…" />
        ) : null}
        {status === "unavailable" ? (
          <EmptyState
            title="Session required"
            description="Connect a DEV session to load the review queue from the API."
          />
        ) : null}
        {status === "error" ? (
          <ErrorState
            title="Could not load review queue"
            message={errorMessage}
            onRetry={() => void loadInitial()}
          />
        ) : null}
        {status === "ready" && items.length === 0 ? (
          <EmptyState
            title="Queue is empty"
            description="There are no pending review items on this page."
          />
        ) : null}
      </div>

      {status === "ready" && items.length > 0 ? (
        <section aria-labelledby="queue-list-heading">
          <h2 id="queue-list-heading" className="sr-only">
            Pending items
          </h2>
          <ul className="review-queue-list">
            {items.map((item) => (
              <li key={`${item.content_id}:${item.version_id}`} className="panel">
                <div className="review-queue-item">
                  <div>
                    <h3>{item.title}</h3>
                    <dl className="review-meta">
                      <div>
                        <dt>Content type</dt>
                        <dd>{item.content_type}</dd>
                      </div>
                      <div>
                        <dt>Version</dt>
                        <dd>{item.version_number}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{item.artifact_status}</dd>
                      </div>
                      <div>
                        <dt>Origin</dt>
                        <dd>{item.origin}</dd>
                      </div>
                      <div>
                        <dt>Submitted</dt>
                        <dd>{formatSubmittedAt(item.submitted_at)}</dd>
                      </div>
                    </dl>
                  </div>
                  <Link
                    className="btn"
                    to={`/teacher-os/review/${item.content_id}/versions/${item.version_id}`}
                  >
                    Open artifact
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {nextCursor ? (
            <div className="review-load-more">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
          {errorMessage && status === "ready" ? (
            <p className="muted" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </section>
      ) : null}
    </article>
  );
}
