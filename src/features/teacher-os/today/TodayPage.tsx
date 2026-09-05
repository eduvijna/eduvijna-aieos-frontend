import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getTodayMission } from "@/services/api/missionApi";
import type { TeacherOsMission } from "@/services/api/generated/teachingTypes";
import { useSession } from "@/services/session/useSession";
import { userMessageForApiError } from "@/shared/errors/ApiError";
import { EmptyState } from "@/shared/components/EmptyState";
import { ErrorState } from "@/shared/components/ErrorState";
import { LoadingState } from "@/shared/components/LoadingState";
import { localToday, localTomorrow } from "@/shared/time/calendarDate";
import {
  continueWorkActionLabel,
  continueWorkSecondaryHeading,
  missionHero,
  preparationSentence,
  reviewPendingSentence,
} from "./missionCopy";
import "./today.css";

type MissionState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; mission: TeacherOsMission }
  | { kind: "error"; message: string };

export function TodayPage() {
  const { isConnected, isProduction } = useSession();
  const [state, setState] = useState<MissionState>({ kind: "loading" });
  const [missionDate] = useState(() => localToday());
  const [tomorrow] = useState(() => localTomorrow());

  const loadMission = useCallback(async () => {
    if (!isConnected && !isProduction) {
      setState({ kind: "unavailable" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const { data } = await getTodayMission(missionDate);
      setState({ kind: "ready", mission: data });
    } catch (error) {
      setState({ kind: "error", message: userMessageForApiError(error) });
    }
  }, [isConnected, isProduction, missionDate]);

  useEffect(() => {
    void loadMission();
  }, [loadMission]);

  const mission = state.kind === "ready" ? state.mission : null;
  const hero = mission ? missionHero(mission, tomorrow) : null;
  const heroKind = mission?.hero_action.kind;

  return (
    <article className="stack mission-page">
      <header className="mission-masthead">
        <p className="muted">Teacher OS · {missionDate}</p>
        <h1>Today&apos;s Mission</h1>
      </header>

      <div className="status-region" aria-live="polite">
        {state.kind === "loading" ? (
          <LoadingState label="Loading today's mission…" />
        ) : null}
        {state.kind === "unavailable" ? (
          <EmptyState
            title="Session required"
            description="Connect a DEV session to load your real mission from the API. No timetable, attendance, or school metrics are invented here."
          />
        ) : null}
        {state.kind === "error" ? (
          <ErrorState
            title="Could not load today's mission"
            message={state.message}
            onRetry={() => void loadMission()}
          />
        ) : null}
      </div>

      {mission && hero ? (
        <section className="mission" aria-labelledby="mission-hero-heading">
          <h2 id="mission-hero-heading" className="mission-hero-headline">
            {hero.headline}
          </h2>
          {hero.detail ? (
            <p className="mission-hero-detail">{hero.detail}</p>
          ) : null}
          <p className="mission-hero-action">
            <Link className="btn" to={hero.actionTo}>
              {hero.actionLabel}
            </Link>
          </p>

          <dl className="mission-secondary">
            {heroKind === "review" ? null : (
              <div>
                <dt>Review</dt>
                <dd>{reviewPendingSentence(mission.review.pending_count)}</dd>
              </div>
            )}
            {heroKind === "continue_work" ? null : (
              <div>
                <dt>
                  {mission.preparation.continue_work
                    ? continueWorkSecondaryHeading(
                        mission.preparation.continue_work,
                      )
                    : "Preparation"}
                </dt>
                <dd>{preparationSentence(mission, tomorrow)}</dd>
              </div>
            )}
            {heroKind === "review" &&
            mission.preparation.continue_work !== null ? (
              <div>
                <dt>Also open</dt>
                <dd>
                  <Link
                    to={`/teacher-os/work/${mission.preparation.continue_work.work_id}`}
                  >
                    {continueWorkActionLabel(
                      mission.preparation.continue_work,
                    )}
                  </Link>
                </dd>
              </div>
            ) : null}
            {heroKind !== "prepare_tomorrow" ? (
              <div>
                <dt>Prepare</dt>
                <dd>
                  <Link to="/teacher-os/prepare">
                    Help me prepare tomorrow
                  </Link>
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}
    </article>
  );
}
