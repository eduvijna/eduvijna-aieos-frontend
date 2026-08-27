import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createTeachingWork } from "@/services/api/teachingWorkApi";
import { useSession } from "@/services/session/useSession";
import { userMessageForApiError } from "@/shared/errors/ApiError";
import { EmptyState } from "@/shared/components/EmptyState";
import { localTomorrow } from "@/shared/time/calendarDate";
import { DEFAULT_LOCALE, INTENT_TYPE, summaryParts } from "./intent";
import "./prepare.css";

type Step = "outcome" | "context" | "confirm";

const STEPS: { id: Step; label: string }[] = [
  { id: "outcome", label: "Outcome" },
  { id: "context", label: "Context" },
  { id: "confirm", label: "Confirm" },
];

export function PreparePage() {
  const navigate = useNavigate();
  const { isConnected, isProduction } = useSession();
  const sessionReady = isConnected || isProduction;

  const [step, setStep] = useState<Step>("outcome");
  const [goalText, setGoalText] = useState("");
  const [classLabel, setClassLabel] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [tomorrow] = useState(() => localTomorrow());
  const [targetDate, setTargetDate] = useState(() => localTomorrow());
  const [locale, setLocale] = useState(DEFAULT_LOCALE);

  const [goalError, setGoalError] = useState("");
  const [contextError, setContextError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [busy, setBusy] = useState(false);
  /** Held across retries so resubmitting the same intent cannot create two Works. */
  const submissionKey = useRef<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const movedByUser = useRef(false);

  useEffect(() => {
    if (!movedByUser.current) return;
    headingRef.current?.focus();
  }, [step]);

  function goTo(next: Step) {
    movedByUser.current = true;
    setStep(next);
  }

  function onSubmitOutcome(event: FormEvent) {
    event.preventDefault();
    if (!goalText.trim()) {
      setGoalError(
        "Describe the outcome in your own words before continuing.",
      );
      return;
    }
    setGoalError("");
    goTo("context");
  }

  function onSubmitContext(event: FormEvent) {
    event.preventDefault();
    if (!targetDate) {
      setContextError("Choose the date this lesson is for.");
      return;
    }
    if (!locale.trim()) {
      setContextError("Locale is required.");
      return;
    }
    setContextError("");
    submissionKey.current = crypto.randomUUID();
    goTo("confirm");
  }

  async function onCreateWork(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatusMessage("Creating your preparation…");
    try {
      const { data } = await createTeachingWork(
        {
          intent_type: INTENT_TYPE,
          goal_text: goalText.trim(),
          class_label: classLabel.trim() ? classLabel.trim() : null,
          subject: subject.trim() ? subject.trim() : null,
          topic: topic.trim() ? topic.trim() : null,
          target_date: targetDate,
          locale: locale.trim(),
        },
        submissionKey.current ?? undefined,
      );
      setStatusMessage("Preparation created.");
      navigate(`/teacher-os/work/${data.work_id}`);
    } catch (error) {
      setStatusMessage(userMessageForApiError(error));
    } finally {
      setBusy(false);
    }
  }

  const parts = summaryParts({
    classLabel,
    subject,
    topic,
    targetDate,
    tomorrow,
  });

  return (
    <article className="stack prepare-page">
      <header>
        <p className="muted">Teacher OS · Prepare</p>
        <h1>Help me prepare tomorrow</h1>
        <p className="prepare-lede">
          Start from the outcome you want, not from a document type. Teacher OS
          keeps the preparation so you can refine it later.
        </p>
      </header>

      {!sessionReady ? (
        <EmptyState
          title="Session required"
          description="Connect a DEV session to create a preparation. Nothing is stored in the browser."
        />
      ) : (
        <>
          <ol className="prepare-steps" aria-label="Preparation steps">
            {STEPS.map((item, index) => (
              <li
                key={item.id}
                className={item.id === step ? "is-current" : undefined}
                aria-current={item.id === step ? "step" : undefined}
              >
                <span className="prepare-step-index">{index + 1}</span>
                {item.label}
              </li>
            ))}
          </ol>

          <section className="panel" aria-labelledby="prepare-step-heading">
            {step === "outcome" ? (
              <form className="prepare-form" noValidate onSubmit={onSubmitOutcome}>
                <h2 id="prepare-step-heading" ref={headingRef} tabIndex={-1}>
                  What should your students understand or be able to do?
                </h2>
                <label htmlFor="prepare-goal-text">
                  Outcome for this lesson
                  <textarea
                    id="prepare-goal-text"
                    name="goal_text"
                    rows={4}
                    required
                    maxLength={2000}
                    value={goalText}
                    aria-describedby={
                      goalError ? "prepare-goal-error" : "prepare-goal-hint"
                    }
                    aria-invalid={goalError ? true : undefined}
                    onChange={(event) => setGoalText(event.target.value)}
                  />
                </label>
                <p id="prepare-goal-hint" className="muted">
                  Plain language is fine, for example &ldquo;explain why leaves
                  look green&rdquo;.
                </p>
                {goalError ? (
                  <p id="prepare-goal-error" className="prepare-error" role="alert">
                    {goalError}
                  </p>
                ) : null}
                <div className="prepare-actions">
                  <button type="submit" className="btn">
                    Continue to context
                  </button>
                </div>
              </form>
            ) : null}

            {step === "context" ? (
              <form className="prepare-form" noValidate onSubmit={onSubmitContext}>
                <h2 id="prepare-step-heading" ref={headingRef} tabIndex={-1}>
                  Where and when does this outcome land?
                </h2>
                <div className="prepare-grid">
                  <label htmlFor="prepare-class-label">
                    Class (optional)
                    <input
                      id="prepare-class-label"
                      name="class_label"
                      type="text"
                      maxLength={255}
                      value={classLabel}
                      aria-describedby="prepare-class-hint"
                      onChange={(event) => setClassLabel(event.target.value)}
                    />
                  </label>
                  <label htmlFor="prepare-subject">
                    Subject (optional)
                    <input
                      id="prepare-subject"
                      name="subject"
                      type="text"
                      maxLength={255}
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                    />
                  </label>
                  <label htmlFor="prepare-topic">
                    Topic (optional)
                    <input
                      id="prepare-topic"
                      name="topic"
                      type="text"
                      maxLength={255}
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                    />
                  </label>
                  <label htmlFor="prepare-target-date">
                    Lesson date
                    <input
                      id="prepare-target-date"
                      name="target_date"
                      type="date"
                      required
                      value={targetDate}
                      aria-describedby="prepare-date-hint"
                      onChange={(event) => setTargetDate(event.target.value)}
                    />
                  </label>
                  <label htmlFor="prepare-locale">
                    Locale
                    <input
                      id="prepare-locale"
                      name="locale"
                      type="text"
                      required
                      maxLength={255}
                      value={locale}
                      onChange={(event) => setLocale(event.target.value)}
                    />
                  </label>
                </div>
                <p id="prepare-class-hint" className="muted">
                  Class is free text you type, such as &ldquo;Grade 5B&rdquo;.
                  It is not linked to any school or ERP record.
                </p>
                <p id="prepare-date-hint" className="muted">
                  Defaults to tomorrow ({tomorrow}) in your device&apos;s
                  calendar. Change it for any other day.
                </p>
                {contextError ? (
                  <p className="prepare-error" role="alert">
                    {contextError}
                  </p>
                ) : null}
                <div className="prepare-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => goTo("outcome")}
                  >
                    Back to outcome
                  </button>
                  <button type="submit" className="btn">
                    Review and confirm
                  </button>
                </div>
              </form>
            ) : null}

            {step === "confirm" ? (
              <form className="prepare-form" noValidate onSubmit={onCreateWork}>
                <h2 id="prepare-step-heading" ref={headingRef} tabIndex={-1}>
                  Confirm this preparation
                </h2>
                <p className="prepare-summary" data-testid="prepare-summary">
                  {parts.join(" · ")}
                </p>
                <p className="prepare-summary-goal">Goal: {goalText.trim()}</p>
                <p className="muted">
                  Creating this keeps the preparation on the server so you can
                  refine it from Today. Nothing is generated yet.
                </p>
                <div className="prepare-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => goTo("context")}
                  >
                    Back to context
                  </button>
                  <button type="submit" className="btn" disabled={busy}>
                    Create preparation
                  </button>
                </div>
              </form>
            ) : null}
          </section>

          <p className="status-region" role="status" aria-live="polite">
            {statusMessage}
          </p>

          <p className="muted">
            <Link to="/teacher-os/today">Back to Today&apos;s Mission</Link>
          </p>
        </>
      )}
    </article>
  );
}
