import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  getClassroomAssessment,
  listClassroomAssessments,
  type ClassroomAssessmentResponse,
} from "@/services/api/classroomAssessmentsApi";
import { createRemediationTeachingWorkFromAssessment } from "@/services/api/teachingWorkApi";
import { useSession } from "@/services/session/useSession";
import {
  ApiError,
  problemCodeFromApiError,
  userMessageForApiError,
} from "@/shared/errors/ApiError";
import { EmptyState } from "@/shared/components/EmptyState";
import { ErrorState } from "@/shared/components/ErrorState";
import { LoadingState } from "@/shared/components/LoadingState";
import { localTomorrow } from "@/shared/time/calendarDate";
import {
  formatAssessmentInstant,
  formatClassResultLevelLabel,
  isAssessmentRecorded,
} from "../assess/assessmentPresentation";
import {
  clearIdempotencyAssociation,
  remediationCreateMaterial,
  retainOrMintIdempotencyKey,
} from "./improveIdempotency";
import {
  assessmentContextRows,
  DEFAULT_IMPROVE_LOCALE,
  GOAL_TEXT_MAX,
  improveHrefForAssessment,
  isEligibleForImprove,
  voidedImproveMessage,
} from "./improvePresentation";
import "./improve.css";

type Step = "hub" | "review" | "goal" | "context" | "confirm";

const FLOW_STEPS: { id: Exclude<Step, "hub">; label: string }[] = [
  { id: "review", label: "Review" },
  { id: "goal", label: "Goal" },
  { id: "context", label: "Context" },
  { id: "confirm", label: "Confirm" },
];

type PageStatus =
  | "loading"
  | "ready"
  | "unavailable"
  | "error"
  | "creating";

function optionalTrim(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function ImprovePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const assessmentIdParam = searchParams.get("assessment_id");
  const { isConnected, isProduction } = useSession();
  const sessionReady = isConnected || isProduction;

  const [status, setStatus] = useState<PageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [eligible, setEligible] = useState<ClassroomAssessmentResponse[]>([]);
  const [selected, setSelected] = useState<ClassroomAssessmentResponse | null>(
    null,
  );
  /** Revision the teacher actually reviewed — never silently replaced. */
  const [reviewedRevision, setReviewedRevision] = useState<number | null>(null);

  const [step, setStep] = useState<Step>("hub");
  const [goalText, setGoalText] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [targetDate, setTargetDate] = useState(() => localTomorrow());
  const [locale, setLocale] = useState(DEFAULT_IMPROVE_LOCALE);
  const [goalError, setGoalError] = useState("");
  const [contextError, setContextError] = useState("");

  const createKeyRef = useRef<string | null>(null);
  const createMaterialRef = useRef<string | null>(null);
  const mutationInFlightRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const movedByUser = useRef(false);

  useEffect(() => {
    if (!movedByUser.current) return;
    headingRef.current?.focus();
  }, [step]);

  const resetCreateAssociation = useCallback(() => {
    clearIdempotencyAssociation(createKeyRef, createMaterialRef);
  }, []);

  const beginReview = useCallback(
    (assessment: ClassroomAssessmentResponse) => {
      if (!isEligibleForImprove(assessment)) {
        setSelected(assessment);
        setReviewedRevision(null);
        setStep("hub");
        setStaleNotice(null);
        setActionMessage(
          voidedImproveMessage(assessment) ??
            "This ClassroomAssessment is not eligible for a new remediation preparation.",
        );
        resetCreateAssociation();
        return;
      }
      setSelected(assessment);
      setReviewedRevision(assessment.aggregate_revision);
      setGoalText("");
      setSubject("");
      setTopic("");
      setTargetDate(localTomorrow());
      setLocale(DEFAULT_IMPROVE_LOCALE);
      setGoalError("");
      setContextError("");
      setStaleNotice(null);
      setActionMessage(null);
      resetCreateAssociation();
      movedByUser.current = true;
      setStep("review");
    },
    [resetCreateAssociation],
  );

  const loadHub = useCallback(async () => {
    if (!sessionReady) {
      setStatus("unavailable");
      return;
    }
    setStatus("loading");
    setErrorMessage(null);
    try {
      const listResponse = await listClassroomAssessments({
        lifecycleState: "RECORDED",
        limit: 50,
      });
      setEligible(listResponse.data.items);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setErrorMessage(userMessageForApiError(error));
    }
  }, [sessionReady]);

  const loadSelectedAssessment = useCallback(
    async (assessmentId: string) => {
      if (!sessionReady) {
        setStatus("unavailable");
        return;
      }
      setStatus("loading");
      setErrorMessage(null);
      setActionMessage(null);
      try {
        const detail = await getClassroomAssessment(assessmentId);
        setStatus("ready");
        beginReview(detail.data);
        if (!isAssessmentRecorded(detail.data)) {
          setActionMessage(
            voidedImproveMessage(detail.data) ??
              "This ClassroomAssessment is no longer RECORDED. It cannot create remediation preparation.",
          );
        }
      } catch (error) {
        setSelected(null);
        setReviewedRevision(null);
        setStep("hub");
        setStatus("error");
        if (error instanceof ApiError && error.status === 404) {
          setErrorMessage(
            "That ClassroomAssessment was not found. It was not substituted with another assessment.",
          );
        } else {
          setErrorMessage(userMessageForApiError(error));
        }
      }
    },
    [beginReview, sessionReady],
  );

  useEffect(() => {
    if (!sessionReady) {
      setStatus("unavailable");
      return;
    }
    if (assessmentIdParam) {
      void loadSelectedAssessment(assessmentIdParam);
      return;
    }
    setSelected(null);
    setReviewedRevision(null);
    setStep("hub");
    void loadHub();
  }, [assessmentIdParam, loadHub, loadSelectedAssessment, sessionReady]);

  function goTo(next: Exclude<Step, "hub">) {
    movedByUser.current = true;
    setStep(next);
  }

  function onChooseAssessment(assessment: ClassroomAssessmentResponse) {
    setSearchParams(
      { assessment_id: assessment.assessment_id },
      { replace: false },
    );
  }

  function onSubmitGoal(event: FormEvent) {
    event.preventDefault();
    if (!goalText.trim()) {
      setGoalError(
        "Write the remediation goal in your own words before continuing.",
      );
      return;
    }
    setGoalError("");
    goTo("context");
  }

  function onSubmitContext(event: FormEvent) {
    event.preventDefault();
    if (!targetDate) {
      setContextError("Choose the target date for this remediation preparation.");
      return;
    }
    if (!locale.trim()) {
      setContextError("Locale is required.");
      return;
    }
    setContextError("");
    goTo("confirm");
  }

  async function handleCreateError(error: unknown) {
    const code = problemCodeFromApiError(error);
    if (
      error instanceof ApiError &&
      (error.status === 412 ||
        code === "assessment_revision_mismatch" ||
        code === "precondition_failed")
    ) {
      resetCreateAssociation();
      if (selected) {
        try {
          const fresh = await getClassroomAssessment(selected.assessment_id);
          setSelected(fresh.data);
          setReviewedRevision(null);
          setStep("hub");
          setStaleNotice(
            "This ClassroomAssessment changed since you reviewed it. Review the current Assessment and confirm again. No automatic resubmit.",
          );
          if (isAssessmentRecorded(fresh.data)) {
            beginReview(fresh.data);
            setStaleNotice(
              "This ClassroomAssessment changed since you reviewed it. Review the current Assessment and confirm again. No automatic resubmit.",
            );
          } else {
            setActionMessage(
              voidedImproveMessage(fresh.data) ??
                "This ClassroomAssessment is no longer RECORDED. It cannot create remediation preparation.",
            );
          }
        } catch {
          setErrorMessage(
            "The Assessment changed or could not be reloaded. Review again before creating remediation.",
          );
        }
      }
      return;
    }
    if (
      error instanceof ApiError &&
      (error.status === 409 ||
        code === "classroom_assessment_not_recorded" ||
        code === "assessment_not_recorded")
    ) {
      resetCreateAssociation();
      if (selected) {
        try {
          const fresh = await getClassroomAssessment(selected.assessment_id);
          setSelected(fresh.data);
          setReviewedRevision(null);
          setStep("hub");
          setActionMessage(
            voidedImproveMessage(fresh.data) ??
              "This ClassroomAssessment is no longer RECORDED. Review the current state. No automatic resubmit.",
          );
        } catch {
          setActionMessage(
            "This ClassroomAssessment is no longer eligible. No automatic resubmit.",
          );
        }
      }
      return;
    }
    if (
      error instanceof ApiError &&
      error.status === 409 &&
      code === "idempotency_key_reused"
    ) {
      resetCreateAssociation();
      setActionMessage(
        "This Idempotency-Key conflicts with different material. Start a new deliberate confirmation (a new key will be minted).",
      );
      return;
    }
    if (error instanceof ApiError && (error.status === 403 || error.status === 401)) {
      setErrorMessage(
        "You are not authorized for this Improve action right now. Server authority denied the request.",
      );
      return;
    }
    if (
      error instanceof ApiError &&
      (error.status === 503 ||
        code === "authorization_unavailable" ||
        code === "school_context_unavailable")
    ) {
      setErrorMessage(
        "Improve authority is temporarily unavailable. No remediation was assumed. Retry when the service recovers.",
      );
      return;
    }
    if (error instanceof ApiError && error.status === 404) {
      setErrorMessage(
        "That ClassroomAssessment was not found. It was not substituted with another assessment.",
      );
      return;
    }
    setErrorMessage(userMessageForApiError(error));
  }

  async function onCreateRemediation(event: FormEvent) {
    event.preventDefault();
    if (!selected || reviewedRevision === null || mutationInFlightRef.current) {
      return;
    }
    if (!isAssessmentRecorded(selected)) {
      setActionMessage(
        voidedImproveMessage(selected) ??
          "This ClassroomAssessment is not eligible for remediation creation.",
      );
      return;
    }

    const goal = goalText.trim();
    const localeValue = locale.trim();
    if (!goal || !targetDate || !localeValue) {
      setActionMessage("Goal, target date, and locale are required.");
      return;
    }

    mutationInFlightRef.current = true;
    setBusy(true);
    setStatus("creating");
    setErrorMessage(null);
    setActionMessage("Creating remediation preparation…");

    const subjectValue = optionalTrim(subject);
    const topicValue = optionalTrim(topic);
    const material = remediationCreateMaterial({
      assessmentId: selected.assessment_id,
      expectedAssessmentAggregateRevision: reviewedRevision,
      goalText: goal,
      targetDate,
      locale: localeValue,
      subject: subjectValue,
      topic: topicValue,
    });
    const idempotencyKey = retainOrMintIdempotencyKey(
      material,
      createKeyRef,
      createMaterialRef,
    );

    try {
      // Optional UX preflight — does not silently adopt a newer revision.
      const preflight = await getClassroomAssessment(selected.assessment_id);
      if (!isAssessmentRecorded(preflight.data)) {
        resetCreateAssociation();
        setSelected(preflight.data);
        setReviewedRevision(null);
        setStep("hub");
        setActionMessage(
          voidedImproveMessage(preflight.data) ??
            "This ClassroomAssessment is no longer RECORDED. No automatic resubmit.",
        );
        return;
      }
      if (preflight.data.aggregate_revision !== reviewedRevision) {
        resetCreateAssociation();
        setSelected(preflight.data);
        setReviewedRevision(null);
        beginReview(preflight.data);
        setStaleNotice(
          "This ClassroomAssessment changed since you reviewed it. Review the current Assessment and confirm again. No automatic resubmit.",
        );
        return;
      }

      const { data } = await createRemediationTeachingWorkFromAssessment(
        {
          assessment_id: selected.assessment_id,
          expected_assessment_aggregate_revision: reviewedRevision,
          goal_text: goal,
          target_date: targetDate,
          locale: localeValue,
          subject: subjectValue,
          topic: topicValue,
        },
        idempotencyKey,
      );
      setActionMessage("Remediation preparation created.");
      navigate(`/teacher-os/work/${data.work_id}`);
    } catch (error) {
      await handleCreateError(error);
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
      setStatus("ready");
    }
  }

  const showFlow = step !== "hub" && selected && reviewedRevision !== null;

  return (
    <article className="stack improve-page">
      <header>
        <p className="muted">Teacher OS · Improve</p>
        <h1>Improve</h1>
        <p className="improve-lede">
          Improve is your deliberate choice to start a remediation preparation
          from a recorded class assessment. Assessed does not mean improvement
          is required — AIEOS does not auto-recommend remediation from the class
          result.
        </p>
      </header>

      <div className="status-region" aria-live="polite">
        {status === "loading" ? (
          <LoadingState label="Loading assessments…" />
        ) : null}
        {status === "unavailable" ? (
          <EmptyState
            title="Session required"
            description="Connect a DEV session to use Improve. Nothing is stored in the browser."
          />
        ) : null}
        {status === "error" && errorMessage ? (
          <ErrorState title="Improve unavailable" message={errorMessage} />
        ) : null}
        {staleNotice ? (
          <p className="improve-error" role="alert">
            {staleNotice}
          </p>
        ) : null}
        {actionMessage ? <p className="muted">{actionMessage}</p> : null}
        {errorMessage && status === "ready" ? (
          <p className="improve-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>

      {sessionReady && status !== "unavailable" ? (
        <>
          {showFlow ? (
            <>
              <ol className="improve-steps" aria-label="Improve steps">
                {FLOW_STEPS.map((item, index) => (
                  <li
                    key={item.id}
                    className={item.id === step ? "is-current" : undefined}
                    aria-current={item.id === step ? "step" : undefined}
                  >
                    <span className="improve-step-index">{index + 1}</span>
                    {item.label}
                  </li>
                ))}
              </ol>

              <section className="panel" aria-labelledby="improve-step-heading">
                {step === "review" && selected ? (
                  <div className="improve-form">
                    <h2
                      id="improve-step-heading"
                      ref={headingRef}
                      tabIndex={-1}
                    >
                      Review the source assessment
                    </h2>
                    <p className="muted">
                      These facts are read-only display. They are not copied into
                      the remediation create request. Class result notes stay on
                      the Assessment.
                    </p>
                    <dl className="work-meta">
                      {assessmentContextRows(selected).map((row) => (
                        <div key={row.label}>
                          <dt>{row.label}</dt>
                          <dd
                            className={
                              row.label === "Class result note"
                                ? "improve-readonly-note"
                                : undefined
                            }
                          >
                            {row.code ? <code>{row.value}</code> : row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <div className="improve-actions">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => goTo("goal")}
                      >
                        Continue to remediation goal
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setSearchParams({}, { replace: false });
                          setSelected(null);
                          setReviewedRevision(null);
                          setStep("hub");
                          resetCreateAssociation();
                          void loadHub();
                        }}
                      >
                        Choose a different assessment
                      </button>
                    </div>
                  </div>
                ) : null}

                {step === "goal" ? (
                  <form
                    className="improve-form"
                    noValidate
                    onSubmit={onSubmitGoal}
                  >
                    <h2
                      id="improve-step-heading"
                      ref={headingRef}
                      tabIndex={-1}
                    >
                      What remediation outcome do you want for this class?
                    </h2>
                    <label htmlFor="improve-goal-text">
                      Remediation goal
                      <textarea
                        id="improve-goal-text"
                        name="goal_text"
                        rows={4}
                        required
                        maxLength={GOAL_TEXT_MAX}
                        value={goalText}
                        aria-describedby={
                          goalError
                            ? "improve-goal-error"
                            : "improve-goal-hint"
                        }
                        aria-invalid={goalError ? true : undefined}
                        onChange={(event) => setGoalText(event.target.value)}
                      />
                    </label>
                    <p id="improve-goal-hint" className="muted">
                      You write and confirm this goal. It is not derived from the
                      class result, note, or any AI suggestion.
                    </p>
                    {goalError ? (
                      <p
                        id="improve-goal-error"
                        className="improve-error"
                        role="alert"
                      >
                        {goalError}
                      </p>
                    ) : null}
                    <div className="improve-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => goTo("review")}
                      >
                        Back
                      </button>
                      <button type="submit" className="btn">
                        Continue to context
                      </button>
                    </div>
                  </form>
                ) : null}

                {step === "context" ? (
                  <form
                    className="improve-form"
                    noValidate
                    onSubmit={onSubmitContext}
                  >
                    <h2
                      id="improve-step-heading"
                      ref={headingRef}
                      tabIndex={-1}
                    >
                      When should this remediation preparation target?
                    </h2>
                    <p className="muted">
                      ClassRef and class label stay authority-derived. They are
                      not editable here and are not sent by the browser.
                    </p>
                    <div className="improve-grid">
                      <label htmlFor="improve-target-date">
                        Target date
                        <input
                          id="improve-target-date"
                          name="target_date"
                          type="date"
                          required
                          value={targetDate}
                          onChange={(event) =>
                            setTargetDate(event.target.value)
                          }
                        />
                      </label>
                      <label htmlFor="improve-locale">
                        Locale
                        <input
                          id="improve-locale"
                          name="locale"
                          type="text"
                          required
                          maxLength={255}
                          value={locale}
                          onChange={(event) => setLocale(event.target.value)}
                        />
                      </label>
                      <label htmlFor="improve-subject">
                        Subject (optional)
                        <input
                          id="improve-subject"
                          name="subject"
                          type="text"
                          maxLength={255}
                          value={subject}
                          onChange={(event) => setSubject(event.target.value)}
                        />
                      </label>
                      <label htmlFor="improve-topic">
                        Topic (optional)
                        <input
                          id="improve-topic"
                          name="topic"
                          type="text"
                          maxLength={255}
                          value={topic}
                          onChange={(event) => setTopic(event.target.value)}
                        />
                      </label>
                    </div>
                    {contextError ? (
                      <p className="improve-error" role="alert">
                        {contextError}
                      </p>
                    ) : null}
                    <div className="improve-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => goTo("goal")}
                      >
                        Back
                      </button>
                      <button type="submit" className="btn">
                        Continue to confirm
                      </button>
                    </div>
                  </form>
                ) : null}

                {step === "confirm" && selected ? (
                  <form
                    className="improve-form"
                    noValidate
                    onSubmit={(event) => void onCreateRemediation(event)}
                  >
                    <h2
                      id="improve-step-heading"
                      ref={headingRef}
                      tabIndex={-1}
                    >
                      Confirm remediation preparation
                    </h2>
                    <div
                      className="improve-confirm-box"
                      role="group"
                      aria-label="Remediation create confirmation"
                    >
                      <p>
                        Creating this starts a remediation preparation. Nothing
                        is generated, published or assigned yet.
                      </p>
                      <dl className="work-meta">
                        <div>
                          <dt>Assessment</dt>
                          <dd>
                            <code>{selected.assessment_id}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>ClassRef</dt>
                          <dd>
                            <code>{selected.class_ref}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>Class result</dt>
                          <dd>
                            {formatClassResultLevelLabel(
                              selected.class_result_level,
                            )}{" "}
                            ({selected.class_result_level})
                          </dd>
                        </div>
                        <div>
                          <dt>Your remediation goal</dt>
                          <dd>{goalText.trim()}</dd>
                        </div>
                        <div>
                          <dt>Target date</dt>
                          <dd>{targetDate}</dd>
                        </div>
                        <div>
                          <dt>Locale</dt>
                          <dd>{locale.trim()}</dd>
                        </div>
                        {optionalTrim(subject) ? (
                          <div>
                            <dt>Subject</dt>
                            <dd>{optionalTrim(subject)}</dd>
                          </div>
                        ) : null}
                        {optionalTrim(topic) ? (
                          <div>
                            <dt>Topic</dt>
                            <dd>{optionalTrim(topic)}</dd>
                          </div>
                        ) : null}
                        <div>
                          <dt>Reviewed Assessment revision</dt>
                          <dd>{reviewedRevision}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="improve-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => goTo("context")}
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        className="btn"
                        disabled={busy}
                        aria-busy={busy || status === "creating"}
                      >
                        Create remediation preparation
                      </button>
                    </div>
                  </form>
                ) : null}
              </section>
            </>
          ) : (
            <section
              className="panel"
              aria-labelledby="improve-hub-heading"
            >
              <h2 id="improve-hub-heading" ref={headingRef} tabIndex={-1}>
                Recorded class assessments
              </h2>
              <p className="muted">
                Eligibility is RECORDED only — not inferred from Demonstrated,
                Mixed, or Not yet demonstrated. Choosing Improve is your
                decision.
              </p>
              {status === "ready" && eligible.length === 0 && !selected ? (
                <EmptyState
                  title="No recorded assessments yet"
                  description="Record a class assessment on Assess first. Improve does not invent sample classes."
                />
              ) : null}
              {selected && !isAssessmentRecorded(selected) ? (
                <ErrorState
                  title="Assessment not eligible"
                  message={
                    voidedImproveMessage(selected) ??
                    "Only a RECORDED ClassroomAssessment can start remediation preparation."
                  }
                />
              ) : null}
              {eligible.length > 0 ? (
                <ul className="improve-card-list">
                  {eligible.map((item) => (
                    <li key={item.assessment_id} className="improve-card">
                      <p>
                        {formatClassResultLevelLabel(item.class_result_level)} ·{" "}
                        <code>{item.class_ref}</code>
                      </p>
                      <p className="muted">
                        Recorded {formatAssessmentInstant(item.recorded_at)} ·
                        revision {item.aggregate_revision}
                      </p>
                      <div className="improve-card-actions">
                        <Link
                          className="btn"
                          to={improveHrefForAssessment(item.assessment_id)}
                          onClick={(event) => {
                            event.preventDefault();
                            onChooseAssessment(item);
                          }}
                        >
                          Improve this class
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          )}
        </>
      ) : null}
    </article>
  );
}
