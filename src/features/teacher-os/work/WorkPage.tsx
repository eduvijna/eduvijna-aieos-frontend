import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";
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
  reviewPathForArtifact,
} from "./preparationKit";
import { stewardshipStatusLabel } from "./stewardshipLabel";
import "./work.css";

export function WorkPage() {
  const { workId = "" } = useParams();
  const { isConnected, isProduction } = useSession();
  const [work, setWork] = useState<TeachingWork | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<WorkArtifactItem[]>([]);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "unavailable"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [prepareMessage, setPrepareMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [form, setForm] = useState<WorkForm>(EMPTY_WORK_FORM);
  const prepareInFlightRef = useRef(false);

  const applyArtifacts = useCallback((items: WorkArtifactItem[]) => {
    setArtifacts(items);
  }, []);

  const loadArtifacts = useCallback(
    async (id: string) => {
      const response = await listTeachingWorkArtifacts(id);
      applyArtifacts(response.data.items);
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
        applyArtifacts(artifactsResponse.data.items);
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

  function update<K extends keyof WorkForm>(key: K, value: WorkForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const hasKit = isCompletePreparationKit(artifacts);
  const kitArtifacts = hasKit ? orderPreparationArtifacts(artifacts) : [];
  const legacyArtifact =
    !hasKit && artifacts.length > 0 ? artifacts[0] : null;
  const showPrepareCta = !hasKit && artifacts.length === 0;

  return (
    <article className="stack work-page">
      <header>
        <p className="muted">
          <Link to="/teacher-os/today">Today&apos;s Mission</Link> · Preparation
        </p>
        <h1>{work ? work.goal_text : "Preparation"}</h1>
      </header>

      <div className="status-region" aria-live="polite">
        {status === "loading" ? (
          <LoadingState label="Loading preparation…" />
        ) : null}
        {status === "unavailable" ? (
          <EmptyState
            title="Session required"
            description="Connect a DEV session to load this preparation from the API."
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
            <h2 id="work-meta-heading">Saved preparation</h2>
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
                <dd>{work.intent_type}</dd>
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
                <button
                  type="submit"
                  className="btn"
                  disabled={busy || preparing}
                >
                  Save changes
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || preparing}
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
                Six artifacts were created for this lesson. Each one is still
                waiting for your review — generating the kit does not approve or
                publish anything.
              </p>
              <ul className="work-kit-list">
                {kitArtifacts.map((item) => (
                  <li key={`${item.content_id}:${item.version_id}`}>
                    <article
                      className="work-kit-card"
                      aria-labelledby={`kit-${item.artifact_kind}-heading`}
                    >
                      <h3 id={`kit-${item.artifact_kind}-heading`}>
                        {preparationArtifactLabel(item.artifact_kind)}
                      </h3>
                      <dl className="work-meta">
                        <div>
                          <dt>Title</dt>
                          <dd>{item.title}</dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>
                            {stewardshipStatusLabel(item.stewardship_state)}
                          </dd>
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
                      <div className="work-actions">
                        <Link
                          className="btn"
                          to={reviewPathForArtifact(item)}
                        >
                          Review{" "}
                          {preparationArtifactLabel(item.artifact_kind)}
                        </Link>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
              <p className="status-region" role="status" aria-live="polite">
                {prepareMessage}
              </p>
            </section>
          ) : null}

          {legacyArtifact ? (
            <section
              className="panel work-artifact-card"
              aria-labelledby="work-artifact-heading"
            >
              <h2 id="work-artifact-heading">Worksheet draft</h2>
              <dl className="work-meta">
                <div>
                  <dt>Status</dt>
                  <dd>
                    {stewardshipStatusLabel(legacyArtifact.stewardship_state)}
                  </dd>
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
              <div className="work-actions">
                <Link
                  className="btn"
                  to={reviewPathForArtifact(legacyArtifact)}
                >
                  Review draft
                </Link>
              </div>
              <p className="status-region" role="status" aria-live="polite">
                {prepareMessage}
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
                  disabled={busy || preparing}
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
