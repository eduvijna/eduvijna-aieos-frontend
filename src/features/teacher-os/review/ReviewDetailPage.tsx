import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getReviewQueueDetail,
  postReviewDecision,
} from "@/services/api/reviewQueueApi";
import type { TeacherReviewQueueDetail } from "@/services/api/generated/reviewTypes";
import { useSession } from "@/services/session/useSession";
import { ApiError, userMessageForApiError } from "@/shared/errors/ApiError";
import { EmptyState } from "@/shared/components/EmptyState";
import { ErrorState } from "@/shared/components/ErrorState";
import { LoadingState } from "@/shared/components/LoadingState";
import { SafeJsonPayload } from "./SafeJsonPayload";
import "./review.css";

type ActionMode = "idle" | "request-changes" | "reject";

export function ReviewDetailPage() {
  const { contentId = "", versionId = "" } = useParams();
  const navigate = useNavigate();
  const { isConnected, isProduction } = useSession();
  const [detail, setDetail] = useState<TeacherReviewQueueDetail | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "unavailable"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ActionMode>("idle");
  const [comment, setComment] = useState("");
  const [rejectConfirmed, setRejectConfirmed] = useState(false);

  const loadDetail = useCallback(async (options?: { silent?: boolean }) => {
    if (!contentId || !versionId) return;
    if (!isConnected && !isProduction) {
      setStatus("unavailable");
      return;
    }
    if (!options?.silent) {
      setStatus("loading");
    }
    setErrorMessage("");
    try {
      const response = await getReviewQueueDetail(contentId, versionId);
      setDetail(response.data);
      setEtag(response.etag);
      setStatus("ready");
    } catch (error) {
      setErrorMessage(userMessageForApiError(error));
      setStatus("error");
    }
  }, [contentId, versionId, isConnected, isProduction]);

  useEffect(() => {
    setActionMessage("");
  }, [contentId, versionId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function runDecision(
    action: "approve" | "request-changes" | "reject",
    body: { comment?: string | null },
  ) {
    if (!etag) {
      setActionMessage(
        "Missing ETag from detail response (client contract error). Refresh and retry.",
      );
      return;
    }
    setBusy(true);
    setActionMessage("");
    try {
      await postReviewDecision(contentId, versionId, action, body, etag);
      setActionMessage(
        action === "approve"
          ? "Approved. Returning to queue…"
          : action === "request-changes"
            ? "Changes requested."
            : "Rejected.",
      );
      navigate("/teacher-os/review");
    } catch (error) {
      if (error instanceof ApiError && error.code === "precondition_failed") {
        setActionMessage(userMessageForApiError(error));
        await loadDetail({ silent: true });
      } else {
        setActionMessage(userMessageForApiError(error));
      }
    } finally {
      setBusy(false);
    }
  }

  function onApprove() {
    void runDecision("approve", {});
  }

  function onRequestChanges(event: FormEvent) {
    event.preventDefault();
    const trimmed = comment.trim();
    if (!trimmed) {
      setActionMessage("A comment is required to request changes.");
      return;
    }
    void runDecision("request-changes", { comment: trimmed });
  }

  function onReject(event: FormEvent) {
    event.preventDefault();
    if (!rejectConfirmed) {
      setActionMessage("Confirm rejection before submitting.");
      return;
    }
    const trimmed = comment.trim();
    void runDecision("reject", {
      comment: trimmed ? trimmed : null,
    });
  }

  return (
    <article className="stack review-detail-page">
      <header>
        <p className="muted">
          <Link to="/teacher-os/review">Review Queue</Link> · Artifact
        </p>
        <h1>{detail?.title ?? "Review artifact"}</h1>
      </header>

      <div className="status-region" aria-live="polite">
        {status === "loading" ? <LoadingState label="Loading artifact…" /> : null}
        {status === "unavailable" ? (
          <EmptyState
            title="Session required"
            description="Connect a DEV session to load this review artifact."
          />
        ) : null}
        {status === "error" ? (
          <ErrorState
            title="Could not load artifact"
            message={errorMessage}
            onRetry={() => void loadDetail()}
          />
        ) : null}
      </div>

      {status === "ready" && detail ? (
        <>
          <section className="panel" aria-labelledby="detail-meta-heading">
            <h2 id="detail-meta-heading">Metadata</h2>
            <dl className="review-meta">
              <div>
                <dt>Content type</dt>
                <dd>{detail.content_type}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{detail.version_number}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{detail.artifact_status}</dd>
              </div>
              <div>
                <dt>Origin</dt>
                <dd>{detail.origin}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{detail.submitted_at}</dd>
              </div>
              <div>
                <dt>Schema</dt>
                <dd>
                  {detail.schema_id} v{detail.schema_version}
                </dd>
              </div>
              <div>
                <dt>Aggregate revision</dt>
                <dd>{detail.aggregate_revision}</dd>
              </div>
              <div>
                <dt>ETag</dt>
                <dd>
                  <code>{etag ?? "missing"}</code>
                </dd>
              </div>
            </dl>
            <p className="muted">{detail.description}</p>
          </section>

          <section className="panel" aria-labelledby="payload-heading">
            <h2 id="payload-heading">Payload</h2>
            <SafeJsonPayload payload={detail.payload} />
          </section>

          <section className="panel" aria-labelledby="actions-heading">
            <h2 id="actions-heading">Review decision</h2>
            <div className="review-actions">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={onApprove}
              >
                Approve
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => {
                  setMode("request-changes");
                  setRejectConfirmed(false);
                  setComment("");
                }}
              >
                Request changes
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => {
                  setMode("reject");
                  setRejectConfirmed(false);
                  setComment("");
                }}
              >
                Reject
              </button>
            </div>

            {mode === "request-changes" ? (
              <form className="review-action-form" onSubmit={onRequestChanges}>
                <label htmlFor="request-changes-comment">
                  Comment (required)
                  <textarea
                    id="request-changes-comment"
                    name="comment"
                    required
                    rows={4}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
                <button type="submit" className="btn" disabled={busy}>
                  Submit request changes
                </button>
              </form>
            ) : null}

            {mode === "reject" ? (
              <form className="review-action-form" onSubmit={onReject}>
                <label className="review-confirm">
                  <input
                    type="checkbox"
                    checked={rejectConfirmed}
                    onChange={(e) => setRejectConfirmed(e.target.checked)}
                  />
                  I confirm I want to reject this artifact
                </label>
                <label htmlFor="reject-comment">
                  Comment (optional)
                  <textarea
                    id="reject-comment"
                    name="comment"
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={busy || !rejectConfirmed}
                >
                  Confirm reject
                </button>
              </form>
            ) : null}

            <p className="status-region" aria-live="assertive" role="status">
              {actionMessage}
            </p>
          </section>
        </>
      ) : null}
    </article>
  );
}
