import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listReviewQueue } from "@/services/api/reviewQueueApi";
import { useSession } from "@/services/session/useSession";
import { userMessageForApiError } from "@/shared/errors/ApiError";
import { EmptyState } from "@/shared/components/EmptyState";
import { ErrorState } from "@/shared/components/ErrorState";
import { LoadingState } from "@/shared/components/LoadingState";
import "./today.css";

type CardState =
  | { kind: "idle" }
  | { kind: "unavailable" }
  | { kind: "loading" }
  | { kind: "empty"; countLabel: string }
  | {
      kind: "ready";
      countLabel: string;
      hasMore: boolean;
    }
  | { kind: "error"; message: string };

export function TodayPage() {
  const { isConnected, isProduction } = useSession();
  const [card, setCard] = useState<CardState>({ kind: "idle" });

  const loadCount = useCallback(async () => {
    if (!isConnected && !isProduction) {
      setCard({ kind: "unavailable" });
      return;
    }
    setCard({ kind: "loading" });
    try {
      const { data } = await listReviewQueue({ limit: 100 });
      const n = data.items.length;
      const hasMore = Boolean(data.next_cursor);
      const countLabel = hasMore ? `${n}+` : String(n);
      if (n === 0 && !hasMore) {
        setCard({ kind: "empty", countLabel: "0" });
      } else {
        setCard({ kind: "ready", countLabel, hasMore });
      }
    } catch (error) {
      setCard({ kind: "error", message: userMessageForApiError(error) });
    }
  }, [isConnected, isProduction]);

  useEffect(() => {
    if (!isConnected && !isProduction) {
      setCard({ kind: "unavailable" });
      return;
    }
    void loadCount();
  }, [isConnected, isProduction, loadCount]);

  return (
    <article className="stack today-page">
      <header>
        <p className="muted">Teacher OS</p>
        <h1>Today&apos;s Mission</h1>
        <p className="today-greeting">
          Good day. Focus on outcomes that need your judgment — starting with
          the Review Queue.
        </p>
      </header>

      <section
        className="panel today-review-card"
        aria-labelledby="today-review-heading"
      >
        <h2 id="today-review-heading">Review Queue</h2>
        <div className="status-region" aria-live="polite">
          {card.kind === "loading" || card.kind === "idle" ? (
            <LoadingState label="Loading pending review count…" />
          ) : null}
          {card.kind === "unavailable" ? (
            <EmptyState
              title="Session required"
              description="Connect a DEV session to load the real pending review count from the API. No fake business data is shown."
            />
          ) : null}
          {card.kind === "empty" ? (
            <EmptyState
              title="No pending reviews"
              description="The first page of the review queue is empty."
              action={
                <Link className="btn" to="/teacher-os/review">
                  Open review queue
                </Link>
              }
            />
          ) : null}
          {card.kind === "ready" ? (
            <div className="today-review-ready">
              <p>
                Pending items (first page
                {card.hasMore ? ", more available" : ""}):{" "}
                <strong>{card.countLabel}</strong>
              </p>
              {card.hasMore ? (
                <p className="muted">
                  Count shows at least {card.countLabel.replace("+", "")}{" "}
                  because a next page cursor is present.
                </p>
              ) : null}
              <Link className="btn" to="/teacher-os/review">
                Load review queue
              </Link>
            </div>
          ) : null}
          {card.kind === "error" ? (
            <ErrorState
              title="Could not load review queue"
              message={card.message}
              onRetry={() => void loadCount()}
            />
          ) : null}
        </div>
      </section>
    </article>
  );
}
