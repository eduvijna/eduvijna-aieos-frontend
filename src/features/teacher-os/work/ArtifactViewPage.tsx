import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";
import {
  getContent,
  getContentVersion,
  publishApprovedContentVersion,
  PublishPrecheckError,
  type ContentResponse,
  type ContentVersionResponse,
} from "@/services/api/contentApi";
import { useSession } from "@/services/session/useSession";
import {
  ApiError,
  problemCodeFromApiError,
  userMessageForApiError,
} from "@/shared/errors/ApiError";
import { EmptyState } from "@/shared/components/EmptyState";
import { ErrorState } from "@/shared/components/ErrorState";
import { LoadingState } from "@/shared/components/LoadingState";
import { SafeJsonPayload } from "@/features/teacher-os/review/SafeJsonPayload";
import { preparationArtifactLabel } from "./preparationKit";
import {
  publicationStatusLabel,
  resolveContentVersionLifecycle,
} from "./lifecycle";
import { canAssignPublishedVersion } from "@/features/teacher-os/teach/learnerAssignable";
import { AssignToClassPanel } from "@/features/teacher-os/teach/AssignToClassPanel";
import "./work.css";

/**
 * Durable Teacher OS artifact viewer. Uses Generic Content GET APIs —
 * not Review Queue detail. Publication truth is published_version_id.
 */
export function ArtifactViewPage() {
  const {
    workId = "",
    contentId = "",
    versionId = "",
  } = useParams();
  const { isConnected, isProduction } = useSession();
  const [content, setContent] = useState<ContentResponse | null>(null);
  const [version, setVersion] = useState<ContentVersionResponse | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "unavailable"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const publishInFlightRef = useRef(false);
  const publishKeyRef = useRef<string | null>(null);

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!contentId || !versionId) return;
      if (!isConnected && !isProduction) {
        setStatus("unavailable");
        return;
      }
      if (!options?.silent) setStatus("loading");
      setErrorMessage("");
      try {
        const [contentResponse, versionResponse] = await Promise.all([
          getContent(contentId),
          getContentVersion(contentId, versionId),
        ]);
        setContent(contentResponse.data);
        setVersion(versionResponse.data);
        setStatus("ready");
      } catch (error) {
        setErrorMessage(userMessageForApiError(error));
        setStatus("error");
      }
    },
    [contentId, versionId, isConnected, isProduction],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function onPublish() {
    if (!content || !version) return;
    if (publishInFlightRef.current) return;
    const actions = resolveContentVersionLifecycle(version.version_id, content);
    if (!actions.showPublish) return;

    if (!publishKeyRef.current) {
      publishKeyRef.current = crypto.randomUUID();
    }
    const idempotencyKey = publishKeyRef.current;

    publishInFlightRef.current = true;
    setPublishing(true);
    setActionMessage("Publishing…");
    try {
      await publishApprovedContentVersion({
        contentId: content.content_id,
        versionId: version.version_id,
        idempotencyKey,
      });
      publishKeyRef.current = null;
      await load({ silent: true });
      setActionMessage("Published. This version is now the published pointer.");
    } catch (error) {
      if (error instanceof PublishPrecheckError) {
        await load({ silent: true });
        switch (error.reason) {
          case "already_published":
            setActionMessage(
              "This exact version is already published. Reloaded the latest state.",
            );
            break;
          case "version_drift":
            setActionMessage(
              "The current version changed since this generation. Publishing this version is blocked. Reloaded the latest state.",
            );
            break;
          case "not_approved":
            setActionMessage(
              "This artifact is no longer approved for publication. Reloaded the latest state.",
            );
            break;
          case "missing_etag":
            setActionMessage(
              "Missing ETag from Content GET (client contract error). Reload and retry.",
            );
            break;
          default:
            setActionMessage("Publication could not proceed. Reloaded state.");
        }
      } else if (
        error instanceof ApiError &&
        error.code === "precondition_failed"
      ) {
        await load({ silent: true });
        setActionMessage(
          "This content changed since you loaded it. Reloaded the latest state — review and publish again if still eligible.",
        );
      } else {
        const problemCode = problemCodeFromApiError(error);
        if (
          problemCode === "asset_governance_rejected" ||
          problemCode === "governance_rejected"
        ) {
          setActionMessage(
            "Publication was rejected by governance. Adjust the artifact and try again later.",
          );
        } else {
          setActionMessage(userMessageForApiError(error));
        }
      }
    } finally {
      publishInFlightRef.current = false;
      setPublishing(false);
    }
  }

  const actions = content
    ? resolveContentVersionLifecycle(versionId, content)
    : null;
  const kindLabel = preparationArtifactLabel(
    content?.content_type ?? version?.schema_id,
  );
  const showAssign =
    content != null &&
    version != null &&
    canAssignPublishedVersion({
      contentType: content.content_type,
      publishedVersionId: content.published_version_id,
      viewedVersionId: version.version_id,
    });

  return (
    <article className="stack work-page">
      <header>
        <p className="muted">
          {workId ? (
            <>
              <Link to={`/teacher-os/work/${workId}`}>Preparation</Link>
              {" · "}
            </>
          ) : null}
          Artifact
        </p>
        <h1>{content?.title ?? "Artifact"}</h1>
      </header>

      <div className="status-region" aria-live="polite">
        {status === "loading" ? (
          <LoadingState label="Loading artifact…" />
        ) : null}
        {status === "unavailable" ? (
          <EmptyState
            title="Session required"
            description="Connect a DEV session to load this artifact from Generic Content."
          />
        ) : null}
        {status === "error" ? (
          <ErrorState
            title="Could not load artifact"
            message={errorMessage}
            onRetry={() => void load()}
          />
        ) : null}
      </div>

      {status === "ready" && content && version ? (
        <>
          <section className="panel" aria-labelledby="artifact-meta-heading">
            <h2 id="artifact-meta-heading">Artifact</h2>
            <dl className="work-meta">
              <div>
                <dt>Kind</dt>
                <dd>{kindLabel}</dd>
              </div>
              <div>
                <dt>Lifecycle</dt>
                <dd>{actions?.label}</dd>
              </div>
              <div>
                <dt>Stewardship</dt>
                <dd>{content.stewardship_state}</dd>
              </div>
              <div>
                <dt>Publication</dt>
                <dd>
                  {publicationStatusLabel(content, version.version_id)}
                </dd>
              </div>
              <div>
                <dt>Content</dt>
                <dd>
                  <code>{content.content_id}</code>
                </dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>
                  <code>{version.version_id}</code>
                </dd>
              </div>
              <div>
                <dt>Version number</dt>
                <dd>{version.version_number}</dd>
              </div>
              <div>
                <dt>Published version</dt>
                <dd>
                  <code>{content.published_version_id ?? "none"}</code>
                </dd>
              </div>
              <div>
                <dt>Origin</dt>
                <dd>{version.origin}</dd>
              </div>
            </dl>
            <p className="muted">
              Loaded from Generic Content. This view does not use the Review
              Queue pending-review projection. Published means this exact
              version is the published pointer — not a stewardship state.
            </p>
          </section>

          <section className="panel" aria-labelledby="artifact-payload-heading">
            <h2 id="artifact-payload-heading">Generated payload</h2>
            <SafeJsonPayload payload={version.payload} />
          </section>

          <section className="panel" aria-labelledby="artifact-actions-heading">
            <h2 id="artifact-actions-heading">Actions</h2>
            <div className="work-actions">
              {workId ? (
                <Link
                  className="btn btn-secondary"
                  to={`/teacher-os/work/${workId}`}
                >
                  Back to preparation
                </Link>
              ) : null}
              {actions?.showPublish ? (
                <button
                  type="button"
                  className="btn"
                  disabled={publishing}
                  aria-busy={publishing}
                  onClick={() => void onPublish()}
                >
                  Publish
                </button>
              ) : null}
              {showAssign ? (
                <button
                  type="button"
                  className="btn"
                  disabled={assignOpen}
                  onClick={() => setAssignOpen(true)}
                >
                  Assign to class
                </button>
              ) : null}
            </div>
            <p className="status-region" role="status" aria-live="assertive">
              {actionMessage}
            </p>
            <p className="muted">
              Publish makes this exact version the published pointer. It does
              not assign, send, or distribute the artifact to learners. Assign
              to class creates a TeachingAssignment — not delivery or LMS
              publish.
            </p>
          </section>

          {assignOpen && content && version ? (
            <AssignToClassPanel
              contentId={content.content_id}
              contentVersionId={version.version_id}
              sourceWorkId={workId || null}
              onClose={() => setAssignOpen(false)}
            />
          ) : null}
        </>
      ) : null}
    </article>
  );
}
