import type {
  MissionContinueWork,
  TeacherOsMission,
} from "@/services/api/generated/teachingTypes";
import { localTomorrow } from "@/shared/time/calendarDate";

/**
 * Mission copy is derived only from the projection the API returned. Every
 * sentence below must remain checkable against a field in `TeacherOsMission`.
 */

export type MissionHero = {
  headline: string;
  detail: string;
  actionLabel: string;
  actionTo: string;
};

/** Teaching Intent discriminator already present on continue_work. */
export function isRemediationContinueWork(
  work: MissionContinueWork,
): boolean {
  return work.intent_type === "remediate_class";
}

export function reviewPendingSentence(pendingCount: number): string {
  if (pendingCount === 0) return "No items are waiting for review.";
  if (pendingCount === 1) return "1 item waiting for review";
  return `${pendingCount} items waiting for review`;
}

/** Topic, then subject. Goal text is shown separately rather than squeezed into a heading. */
export function workSnippet(work: MissionContinueWork): string | null {
  const topic = work.topic?.trim();
  if (topic) return topic;
  const subject = work.subject?.trim();
  if (subject) return subject;
  return null;
}

export function continueWorkActionLabel(
  work: MissionContinueWork | null | undefined,
): string {
  if (work && isRemediationContinueWork(work)) {
    return "Continue remediation preparation";
  }
  return "Continue preparation";
}

export function continueWorkHeadline(
  work: MissionContinueWork,
  tomorrow: string = localTomorrow(),
): string {
  const snippet = workSnippet(work);

  if (isRemediationContinueWork(work)) {
    if (snippet) {
      return `Continue the follow-up for ${snippet}`;
    }
    return "Continue class improvement";
  }

  if (work.target_date === tomorrow) {
    return snippet
      ? `Continue tomorrow's ${snippet} preparation`
      : "Continue tomorrow's preparation";
  }
  return snippet
    ? `Continue your ${snippet} preparation for ${work.target_date}`
    : `Continue your preparation for ${work.target_date}`;
}

export function preparationSentence(
  mission: TeacherOsMission,
  tomorrow: string = localTomorrow(),
): string {
  const { active_work_count: count, continue_work: work } = mission.preparation;
  if (count === 0 || !work) {
    return "No preparation is in progress.";
  }
  const snippet = workSnippet(work);
  const focus = snippet ? `${snippet}: ` : "";
  const others =
    count > 1
      ? ` Plus ${count - 1} other active preparation${count - 1 === 1 ? "" : "s"}.`
      : "";

  if (isRemediationContinueWork(work)) {
    const scope =
      work.target_date === tomorrow
        ? "tomorrow"
        : `the lesson on ${work.target_date}`;
    return `Class improvement for ${scope} is in progress — ${focus}${work.goal_text}${others}`;
  }

  const scope =
    work.target_date === tomorrow
      ? "tomorrow"
      : `the lesson on ${work.target_date}`;
  return `Preparation for ${scope} is in progress — ${focus}${work.goal_text}${others}`;
}

/** Secondary-row label when Review is hero and continue_work is also present. */
export function continueWorkSecondaryHeading(
  work: MissionContinueWork,
): string {
  return isRemediationContinueWork(work) ? "Class improvement" : "Preparation";
}

export function missionHero(
  mission: TeacherOsMission,
  tomorrow: string = localTomorrow(),
): MissionHero {
  const work = mission.preparation.continue_work;

  switch (mission.hero_action.kind) {
    case "review":
      return {
        headline: reviewPendingSentence(mission.review.pending_count),
        detail:
          "Approving, requesting changes, or rejecting is work only you can do.",
        actionLabel: "Open review queue",
        actionTo: "/teacher-os/review",
      };
    case "continue_work": {
      const workId = mission.hero_action.work_id ?? work?.work_id ?? "";
      return {
        headline: work
          ? continueWorkHeadline(work, tomorrow)
          : "Continue your preparation",
        detail: work ? `Goal: ${work.goal_text}` : "",
        actionLabel: continueWorkActionLabel(work),
        actionTo: `/teacher-os/work/${workId}`,
      };
    }
    default:
      return {
        headline: "Nothing is waiting. Prepare tomorrow's lesson.",
        detail:
          "Start from the outcome you want your students to reach, and Teacher OS keeps the preparation.",
        actionLabel: "Help me prepare tomorrow",
        actionTo: "/teacher-os/prepare",
      };
  }
}
