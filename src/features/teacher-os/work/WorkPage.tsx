import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  generateTeachingWork,
  getTeachingWork,
  listTeachingWorkArtifacts,
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
import { stewardshipStatusLabel } from "./stewardshipLabel";
import "./work.css";

export function WorkPage() {
  const { workId = "" } = useParams();
  const navigate = useNavigate();
  const { isConnected, isProduction } = useSession();
  const [work, setWork] = useState<TeachingWork | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<WorkArtifactItem | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "unavailable"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [generateMessage, setGenerateMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState<WorkForm>(EMPTY_WORK_FORM);

  const loadArtifacts = useCallback(async (id: string) => {
    const response = await listTeachingWorkArtifacts(id);
    setArtifact(response.data.items[0] ?? null);
    return response.data;
  }, []);

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
        setArtifact(artifactsResponse.data.items[0] ?? null);
        setStatus("ready");
      } catch (error) {
        setErrorMessage(userMessageForApiError(error));
        setStatus("error");
      }
    },
    [workId, isConnected, isProduction],
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

  async function onGenerate() {
    if (!work) return;
    if (!etag) {
      setGenerateMessage(
        "Missing ETag from the last read (client contract error). Reload and retry.",
      );
      return;
    }

    setGenerating(true);
    setGenerateMessage("Creating your preparation draft…");
    try {
      const response = await generateTeachingWork(work.work_id, etag);
      const { content_id, version_id } = response.data.artifact;
      navigate(
        `/teacher-os/review/${content_id}/versions/${version_id}`,
      );
    } catch (error) {
      const problemCode = problemCodeFromApiError(error);

      if (
        error instanceof ApiError &&
        (error.code === "precondition_failed" ||
          problemCode === "work_generation_revision_conflict")
      ) {
        await loadWork({ silent: true });
        setGenerateMessage(
          "This preparation changed since you loaded it. The latest values are shown — generate again from this revision.",
        );
      } else if (problemCode === "work_generation_in_progress") {
        setGenerateMessage(
          "A preparation draft is already being created for this request. Wait a moment, then reload if it does not appear.",
        );
      } else if (problemCode === "work_generation_already_exists") {
        try {
          await loadArtifacts(work.work_id);
          setGenerateMessage(
            "A preparation draft already exists for this Work. Review it below.",
          );
        } catch {
          setGenerateMessage(
            "A preparation draft already exists for this Work. Reload to open it.",
          );
        }
      } else if (problemCode === "educational_quality_failed") {
        setGenerateMessage(
          "No draft was created. The educational quality checks did not pass. Adjust the preparation and try again later.",
        );
      } else if (
        problemCode === "model_provider_unavailable" ||
        problemCode === "model_generation_failed" ||
        problemCode === "model_output_invalid" ||
        (error instanceof ApiError && error.code === "unavailable")
      ) {
        setGenerateMessage(
          "The draft could not be created right now. Try again later.",
        );
      } else if (
        error instanceof ApiError &&
        error.code === "precondition_required"
      ) {
        setGenerateMessage(userMessageForApiError(error));
      } else {
        setGenerateMessage(userMessageForApiError(error));
      }
    } finally {
      setGenerating(false);
    }
  }

  function update<K extends keyof WorkForm>(key: K, value: WorkForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const reviewPath = artifact
    ? `/teacher-os/review/${artifact.content_id}/versions/${artifact.version_id}`
    : null;

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
                <button type="submit" className="btn" disabled={busy || generating}>
                  Save changes
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || generating}
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

          {artifact && reviewPath ? (
            <section
              className="panel work-artifact-card"
              aria-labelledby="work-artifact-heading"
            >
              <h2 id="work-artifact-heading">Worksheet draft</h2>
              <dl className="work-meta">
                <div>
                  <dt>Status</dt>
                  <dd>{stewardshipStatusLabel(artifact.stewardship_state)}</dd>
                </div>
                <div>
                  <dt>Title</dt>
                  <dd>{artifact.title}</dd>
                </div>
              </dl>
              {artifact.educational_quality ? (
                <div className="work-eq">
                  <h3 className="work-eq-heading">Educational checks</h3>
                  <p className="muted">
                    Result: {artifact.educational_quality.status}
                  </p>
                  <ul className="work-eq-list">
                    {artifact.educational_quality.checks.map((check) => (
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
                <Link className="btn" to={reviewPath}>
                  Review draft
                </Link>
              </div>
              <p className="status-region" role="status" aria-live="polite">
                {generateMessage}
              </p>
            </section>
          ) : (
            <section className="panel" aria-labelledby="work-generate-heading">
              <h2 id="work-generate-heading">Preparation draft</h2>
              <p>
                Generate a preparation draft from this saved Work. DEV03 creates
                the first worksheet draft for review — nothing is approved or
                published from here.
              </p>
              <div className="work-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy || generating}
                  onClick={() => void onGenerate()}
                >
                  Generate preparation draft
                </button>
              </div>
              <p className="status-region" role="status" aria-live="assertive">
                {generateMessage}
              </p>
            </section>
          )}
        </>
      ) : null}
    </article>
  );
}
