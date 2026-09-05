import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";
import {
  getContent,
  PublishPrecheckError,
  publishApprovedContentVersion,
  type ContentResponse,
} from "@/services/api/contentApi";
import {
  getTeachingWork,
  listTeachingWorkArtifacts,
  prepareTeachingWork,
  refineTeachingWork,
} from "@/services/api/teachingWorkApi";
import type {
  TeachingWork,
  WorkArtifactItem,
} from "@/services/api/generated/teachingTypes";
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
  buildRefineBody,
  EMPTY_WORK_FORM,
  formFromWork,
  type WorkForm,
} from "./refine";
import {
  isCompletePreparationKit,
  orderPreparationArtifacts,
  preparationArtifactLabel,
} from "./preparationKit";
import {
  artifactViewPath,
  formatArtifactLifecycleSummary,
  resolveArtifactLifecycle,
  reviewPathForArtifact,
  summarizeResolvedLifecycle,
  type ArtifactLifecycleActions,
} from "./lifecycle";
import { formatImproveIntentLabel } from "../improve/improvePresentation";
import "./work.css";

function ArtifactActions(props: {
  item: WorkArtifactItem;
  workId: string;
  kindLabel: string;
  actions: ArtifactLifecycleActions;
  publishing: boolean;
  onPublish: (item: WorkArtifactItem) => void;
}) {
  const { actions } = props;
  return (
    <div className="work-actions">
      {actions.showReview ? (
        <Link
          className="btn"
          to={reviewPathForArtifact(props.item, props.workId)}
        >
          Review {props.kindLabel}
        </Link>
      ) : null}
      {actions.showView ? (
        <Link
          className="btn btn-secondary"
          to={artifactViewPath(props.workId, props.item)}
        >
          View
        </Link>
      ) : null}
      {actions.showPublish ? (
        <button
          type="button"
          className="btn"
          disabled={props.publishing}
          aria-busy={props.publishing}
          onClick={() => props.onPublish(props.item)}
        >
          Publish
        </button>
      ) : null}
    </div>
  );
}

export function WorkPage() {
  const { workId = "" } = useParams();
  const { isConnected, isProduction } = useSession();
  const [work, setWork] = useState<TeachingWork | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<WorkArtifactItem[]>([]);
  /** Transient Content GET map for publication truth — never persisted. */
  const [contentById, setContentById] = useState<
    Record<string, ContentResponse>
  >({});
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "unavailable"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [prepareMessage, setPrepareMessage] = useState("");
  const [publishMessage, setPublishMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [publishingContentId, setPublishingContentId] = useState<string | null>(
    null,
  );
  const [form, setForm] = useState<WorkForm>(EMPTY_WORK_FORM);
  const prepareInFlightRef = useRef(false);
  const publishInFlightRef = useRef(false);
  const publishKeysRef = useRef<Map<string, string>>(new Map());

  const hydrateContents = useCallback(async (items: WorkArtifactItem[]) => {
    if (items.length === 0) {
      setContentById({});
      return;
    }
    const entries = await Promise.all(
      items.map(async (item) => {
        try {
          const response = await getContent(item.content_id);
          return [item.content_id, response.data] as const;
        } catch {
          return null;
        }
      }),
    );
    const next: Record<string, ContentResponse> = {};
    for (const entry of entries) {
      if (entry) next[entry[0]] = entry[1];
    }
    setContentById(next);
  }, []);

  const applyArtifacts = useCallback(
    async (items: WorkArtifactItem[]) => {
      setArtifacts(items);
      await hydrateContents(items);
    },
    [hydrateContents],
  );

  const loadArtifacts = useCallback(
    async (id: string) => {
      const response = await listTeachingWorkArtifacts(id);
      await applyArtifacts(response.data.items);
      return response.data;
    },
    [applyArtifacts],
  );

  const loadWork = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!workId) return;
      if (!isConnected && !isProduction) {
        setStatus("unavailable");
        return;
      }
      if (!options?.silent) setStatus("loading");
      setErrorMessage("");
      try {
        const [workResponse, artifactsResponse] = await Promise.all([
          getTeachingWork(workId),
          listTeachingWorkArtifacts(workId),
        ]);
        setWork(workResponse.data);
        setEtag(workResponse.etag);
        setForm(formFromWork(workResponse.data));
        await applyArtifacts(artifactsResponse.data.items);
        setStatus("ready");
      } catch (error) {
        setErrorMessage(userMessageForApiError(error));
        setStatus("error");
      }
    },
    [workId, isConnected, isProduction, applyArtifacts],
  );

  useEffect(() => {
    void loadWork();
  }, [loadWork]);

  function lifecycleFor(item: WorkArtifactItem): ArtifactLifecycleActions {
    return resolveArtifactLifecycle(
      item.version_id,
      item.stewardship_state,
      contentById[item.content_id] ?? null,
    );
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!work) return;
    if (!form.goalText.trim()) {
      setSaveMessage("The outcome cannot be emptied.");
      return;
    }
    if (!etag) {
      setSaveMessage(
        "Missing ETag from the last read (client contract error). Reload and retry.",
      );
      return;
    }
    const body = buildRefineBody(work, form);
    if (Object.keys(body).length === 0) {
      setSaveMessage("Nothing has changed yet.");
      return;
    }

    setBusy(true);
    setSaveMessage("Saving…");
    try {
      const response = await refineTeachingWork(work.work_id, body, etag);
      setWork(response.data);
      setEtag(response.etag);
      setForm(formFromWork(response.data));
      setSaveMessage(
        `Saved. This preparation is now at revision ${response.data.aggregate_revision}.`,
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === "precondition_failed") {
        await loadWork({ silent: true });
        setSaveMessage(
          "This preparation changed elsewhere since you loaded it. The latest saved values are shown — review them and save again.",
        );
      } else {
        setSaveMessage(userMessageForApiError(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onPrepare() {
    if (!work) return;
    if (prepareInFlightRef.current) return;
    if (!etag) {
      setPrepareMessage(
        "Missing ETag from the last read (client contract error). Reload and retry.",
      );
      return;
    }

    const idempotencyKey = crypto.randomUUID();
    prepareInFlightRef.current = true;
    setPreparing(true);
    setPrepareMessage("Creating your preparation kit…");
    try {
      await prepareTeachingWork(work.work_id, etag, idempotencyKey);
      await loadWork({ silent: true });
      setPrepareMessage(
        "Preparation kit created. Each artifact is waiting for your review — nothing is approved or published yet.",
      );
    } catch (error) {
      const problemCode = problemCodeFromApiError(error);

      if (
        error instanceof ApiError &&
        (error.code === "precondition_failed" ||
          problemCode === "work_generation_revision_conflict")
      ) {
        await loadWork({ silent: true });
        setPrepareMessage(
          "This preparation changed since you loaded it. The latest values are shown — create the preparation kit again from this revision.",
        );
      } else if (problemCode === "work_generation_in_progress") {
        setPrepareMessage(
          "A preparation kit is already being created for this request. Wait a moment, then reload if it does not appear.",
        );
      } else if (problemCode === "work_generation_already_exists") {
        try {
          await loadArtifacts(work.work_id);
          setPrepareMessage(
            "A preparation kit already exists for this Work. Review the artifacts below.",
          );
        } catch {
          setPrepareMessage(
            "A preparation kit already exists for this Work. Reload to open it.",
          );
        }
      } else if (problemCode === "preparation_recovery_invariant_violation") {
        setPrepareMessage(
          "The preparation kit could not be confirmed safely. No complete kit is shown. Reload and try again, or contact support if this continues.",
        );
      } else if (problemCode === "educational_quality_failed") {
        setPrepareMessage(
          "No complete preparation kit was created. The educational quality checks did not pass. Adjust the preparation and try again later.",
        );
      } else if (
        problemCode === "model_provider_unavailable" ||
        problemCode === "model_generation_failed" ||
        problemCode === "model_output_invalid" ||
        (error instanceof ApiError && error.code === "unavailable")
      ) {
        setPrepareMessage(
          "The preparation kit could not be created right now. Try again later.",
        );
      } else if (
        error instanceof ApiError &&
        error.code === "precondition_required"
      ) {
        setPrepareMessage(userMessageForApiError(error));
      } else {
        setPrepareMessage(userMessageForApiError(error));
      }
    } finally {
      prepareInFlightRef.current = false;
      setPreparing(false);
    }
  }

  async function onPublish(item: WorkArtifactItem) {
    if (!work) return;
    if (publishInFlightRef.current) return;
    const actions = lifecycleFor(item);
    if (!actions.showPublish) return;

    const actionKey = `${item.content_id}:${item.version_id}`;
    let idempotencyKey = publishKeysRef.current.get(actionKey);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      publishKeysRef.current.set(actionKey, idempotencyKey);
    }

    publishInFlightRef.current = true;
    setPublishingContentId(item.content_id);
    setPublishMessage(`Publishing ${item.title}…`);
    try {
      await publishApprovedContentVersion({
        contentId: item.content_id,
        versionId: item.version_id,
        idempotencyKey,
      });
      publishKeysRef.current.delete(actionKey);
      await loadArtifacts(work.work_id);
      setPublishMessage(
        `${item.title} is now Published. Publishing does not assign or send it to learners.`,
      );
    } catch (error) {
      if (error instanceof PublishPrecheckError) {
        await loadArtifacts(work.work_id);
        switch (error.reason) {
          case "already_published":
            setPublishMessage(
              "That exact version is already published. Reloaded the latest artifact states.",
            );
            break;
          case "version_drift":
            setPublishMessage(
              "The current version no longer matches this generation. Publishing is blocked. Reloaded the latest states.",
            );
            break;
          case "not_approved":
            setPublishMessage(
              "This artifact is no longer approved. Reloaded the latest states.",
            );
            break;
          case "missing_etag":
            setPublishMessage(
              "Missing ETag from Content GET (client contract error). Reload and retry.",
            );
            break;
          default:
            setPublishMessage(
              "Publication could not proceed. Reloaded the latest states.",
            );
        }
      } else if (
        error instanceof ApiError &&
        error.code === "precondition_failed"
      ) {
        await loadWork({ silent: true });
        setPublishMessage(
          "This content changed since you loaded it. Reloaded the latest state — review and publish again if still eligible.",
        );
      } else {
        const problemCode = problemCodeFromApiError(error);
        if (
          problemCode === "asset_governance_rejected" ||
          problemCode === "governance_rejected"
        ) {
          setPublishMessage(
            "Publication was rejected by governance. Adjust the artifact and try again later.",
          );
        } else {
          setPublishMessage(userMessageForApiError(error));
        }
      }
    } finally {
      publishInFlightRef.current = false;
      setPublishingContentId(null);
    }
  }

  function update<K extends keyof WorkForm>(key: K, value: WorkForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const hasKit = isCompletePreparationKit(artifacts);
  const kitArtifacts = hasKit ? orderPreparationArtifacts(artifacts) : [];
  const legacyArtifact =
    !hasKit && artifacts.length > 0 ? artifacts[0] : null;
  const showPrepareCta = !hasKit && artifacts.length === 0;
  const lifecycleSummary =
    artifacts.length > 0
      ? formatArtifactLifecycleSummary(
          summarizeResolvedLifecycle(artifacts.map((item) => lifecycleFor(item))),
        )
      : null;
  const anyBusy = busy || preparing || publishingContentId !== null;
  const isRemediation = work?.intent_type === "remediate_class";
  const workKindLabel = isRemediation
    ? "Remediation preparation"
    : "Preparation";

  return (
    <article className="stack work-page">
      <header>
        <p className="muted">
          <Link to="/teacher-os/today">Today&apos;s Mission</Link> ·{" "}
          {workKindLabel}
        </p>
        <h1>{work ? work.goal_text : workKindLabel}</h1>
      </header>

      <div className="status-region" aria-live="polite">
        {status === "loading" ? (
          <LoadingState label={`Loading ${workKindLabel.toLowerCase()}…`} />
        ) : null}
        {status === "unavailable" ? (
          <EmptyState
            title="Session required"
            description={`Connect a DEV session to load this ${workKindLabel.toLowerCase()} from the API.`}
          />
        ) : null}
        {status === "error" ? (
          <ErrorState
            title="Could not load preparation"
            message={errorMessage}
            onRetry={() => void loadWork()}
          />
        ) : null}
      </div>

      {status === "ready" && work ? (
        <>
          <section className="panel" aria-labelledby="work-meta-heading">
            <h2 id="work-meta-heading">
              {isRemediation ? "Saved remediation preparation" : "Saved preparation"}
            </h2>
            <dl className="work-meta">
              <div>
                <dt>Outcome</dt>
                <dd>{work.goal_text}</dd>
              </div>
              <div>
                <dt>Class</dt>
                <dd>{work.class_label ?? "Not set"}</dd>
              </div>
              <div>
                <dt>Subject</dt>
                <dd>{work.subject ?? "Not set"}</dd>
              </div>
              <div>
                <dt>Topic</dt>
                <dd>{work.topic ?? "Not set"}</dd>
              </div>
              <div>
                <dt>Lesson date</dt>
                <dd>{work.target_date}</dd>
              </div>
              <div>
                <dt>Locale</dt>
                <dd>{work.locale}</dd>
              </div>
              <div>
                <dt>Intent</dt>
                <dd>{formatImproveIntentLabel(work.intent_type)}</dd>
              </div>
              <div>
                <dt>Revision</dt>
                <dd>{work.aggregate_revision}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{work.created_at}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{work.updated_at}</dd>
              </div>
            </dl>
            <p className="muted">
              These values come from the server on every read. Nothing about
              this preparation is kept in the browser.
            </p>
          </section>

          <section className="panel" aria-labelledby="work-refine-heading">
            <h2 id="work-refine-heading">Refine this preparation</h2>
            <form className="work-form" noValidate onSubmit={onSave}>
              <label htmlFor="work-goal-text">
                Outcome
                <textarea
                  id="work-goal-text"
                  name="goal_text"
                  rows={4}
                  required
                  maxLength={2000}
                  value={form.goalText}
                  onChange={(event) => update("goalText", event.target.value)}
                />
              </label>
              <div className="work-grid">
                <label htmlFor="work-class-label">
                  Class
                  <input
                    id="work-class-label"
                    name="class_label"
                    type="text"
                    maxLength={255}
                    value={form.classLabel}
                    onChange={(event) =>
                      update("classLabel", event.target.value)
                    }
                  />
                </label>
                <label htmlFor="work-subject">
                  Subject
                  <input
                    id="work-subject"
                    name="subject"
                    type="text"
                    maxLength={255}
                    value={form.subject}
                    onChange={(event) => update("subject", event.target.value)}
                  />
                </label>
                <label htmlFor="work-topic">
                  Topic
                  <input
                    id="work-topic"
                    name="topic"
                    type="text"
                    maxLength={255}
                    value={form.topic}
                    onChange={(event) => update("topic", event.target.value)}
                  />
                </label>
                <label htmlFor="work-target-date">
                  Lesson date
                  <input
                    id="work-target-date"
                    name="target_date"
                    type="date"
                    required
                    value={form.targetDate}
                    onChange={(event) =>
                      update("targetDate", event.target.value)
                    }
                  />
                </label>
                <label htmlFor="work-locale">
                  Locale
                  <input
                    id="work-locale"
                    name="locale"
                    type="text"
                    required
                    maxLength={255}
                    value={form.locale}
                    onChange={(event) => update("locale", event.target.value)}
                  />
                </label>
              </div>
              <p className="muted">
                Clearing an optional field removes it. Saving uses the revision
                you loaded (<code>{etag ?? "missing"}</code>), so a conflicting
                change elsewhere is reported instead of silently overwritten.
              </p>
              <div className="work-actions">
                <button type="submit" className="btn" disabled={anyBusy}>
                  Save changes
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={anyBusy}
                  onClick={() => void loadWork()}
                >
                  Reload from server
                </button>
              </div>
              <p className="status-region" role="status" aria-live="assertive">
                {saveMessage}
              </p>
            </form>
          </section>

          {hasKit ? (
            <section
              className="panel work-kit"
              aria-labelledby="work-kit-heading"
            >
              <h2 id="work-kit-heading">Preparation kit</h2>
              <p>
                Six artifacts were created for this lesson. Review each one,
                then explicitly Publish when you are ready — nothing is
                published automatically.
              </p>
              {lifecycleSummary ? (
                <p
                  className="work-lifecycle-summary"
                  data-testid="work-lifecycle-summary"
                >
                  {lifecycleSummary}
                </p>
              ) : null}
              <ul className="work-kit-list">
                {kitArtifacts.map((item) => {
                  const kindLabel = preparationArtifactLabel(item.artifact_kind);
                  const actions = lifecycleFor(item);
                  return (
                    <li key={`${item.content_id}:${item.version_id}`}>
                      <article
                        className="work-kit-card"
                        aria-labelledby={`kit-${item.artifact_kind}-heading`}
                        data-stewardship={item.stewardship_state}
                        data-lifecycle={actions.kind}
                        data-content-id={item.content_id}
                      >
                        <h3 id={`kit-${item.artifact_kind}-heading`}>
                          {kindLabel}
                        </h3>
                        <dl className="work-meta">
                          <div>
                            <dt>Title</dt>
                            <dd>{item.title}</dd>
                          </div>
                          <div>
                            <dt>Status</dt>
                            <dd>{actions.label}</dd>
                          </div>
                        </dl>
                        {item.educational_quality ? (
                          <div className="work-eq">
                            <h4 className="work-eq-heading">
                              Educational checks
                            </h4>
                            <p className="muted">
                              Result: {item.educational_quality.status}
                            </p>
                            <ul className="work-eq-list">
                              {item.educational_quality.checks.map((check) => (
                                <li key={check.code}>
                                  <span className="work-eq-code">
                                    {check.code}
                                  </span>
                                  {": "}
                                  {check.passed ? "passed" : "not passed"}
                                  {" — "}
                                  {check.explanation}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <ArtifactActions
                          item={item}
                          workId={work.work_id}
                          kindLabel={kindLabel}
                          actions={actions}
                          publishing={publishingContentId === item.content_id}
                          onPublish={(target) => void onPublish(target)}
                        />
                      </article>
                    </li>
                  );
                })}
              </ul>
              <p className="status-region" role="status" aria-live="polite">
                {prepareMessage}
              </p>
              <p className="status-region" role="status" aria-live="assertive">
                {publishMessage}
              </p>
            </section>
          ) : null}

          {legacyArtifact ? (
            <section
              className="panel work-artifact-card"
              aria-labelledby="work-artifact-heading"
              data-stewardship={legacyArtifact.stewardship_state}
              data-lifecycle={lifecycleFor(legacyArtifact).kind}
              data-content-id={legacyArtifact.content_id}
            >
              <h2 id="work-artifact-heading">Worksheet draft</h2>
              {lifecycleSummary ? (
                <p
                  className="work-lifecycle-summary"
                  data-testid="work-lifecycle-summary"
                >
                  {lifecycleSummary}
                </p>
              ) : null}
              <dl className="work-meta">
                <div>
                  <dt>Status</dt>
                  <dd>{lifecycleFor(legacyArtifact).label}</dd>
                </div>
                <div>
                  <dt>Title</dt>
                  <dd>{legacyArtifact.title}</dd>
                </div>
              </dl>
              {legacyArtifact.educational_quality ? (
                <div className="work-eq">
                  <h3 className="work-eq-heading">Educational checks</h3>
                  <p className="muted">
                    Result: {legacyArtifact.educational_quality.status}
                  </p>
                  <ul className="work-eq-list">
                    {legacyArtifact.educational_quality.checks.map((check) => (
                      <li key={check.code}>
                        <span className="work-eq-code">{check.code}</span>
                        {": "}
                        {check.passed ? "passed" : "not passed"}
                        {" — "}
                        {check.explanation}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <ArtifactActions
                item={legacyArtifact}
                workId={work.work_id}
                kindLabel="draft"
                actions={lifecycleFor(legacyArtifact)}
                publishing={publishingContentId === legacyArtifact.content_id}
                onPublish={(target) => void onPublish(target)}
              />
              <p className="status-region" role="status" aria-live="polite">
                {prepareMessage}
              </p>
              <p className="status-region" role="status" aria-live="assertive">
                {publishMessage}
              </p>
            </section>
          ) : null}

          {showPrepareCta ? (
            <section className="panel" aria-labelledby="work-prepare-heading">
              <h2 id="work-prepare-heading">Preparation kit</h2>
              <p>
                Ask AIEOS to prepare this lesson once. That creates the lesson
                plan, worksheet, quick quiz, homework, answer key, and teacher
                notes for review — nothing is approved or published from here.
              </p>
              <div className="work-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={anyBusy}
                  aria-busy={preparing}
                  onClick={() => void onPrepare()}
                >
                  Create preparation kit
                </button>
              </div>
              <p className="status-region" role="status" aria-live="assertive">
                {prepareMessage}
              </p>
            </section>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
