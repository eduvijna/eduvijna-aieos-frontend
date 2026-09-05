import { describe, expect, it } from "vitest";
import {
  continueWorkActionLabel,
  continueWorkHeadline,
  continueWorkSecondaryHeading,
  isRemediationContinueWork,
  missionHero,
  preparationSentence,
} from "./missionCopy";
import type {
  MissionContinueWork,
  TeacherOsMission,
} from "@/services/api/generated/teachingTypes";
import { calendarDate } from "@/test/test-utils";

const tomorrow = calendarDate(1);
const later = calendarDate(4);

const normalWork: MissionContinueWork = {
  work_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  intent_type: "prepare_tomorrow",
  goal_text: "Explain why leaves look green",
  class_label: "7-B",
  subject: "Science",
  topic: "Photosynthesis",
  target_date: tomorrow,
  aggregate_revision: 0,
  updated_at: "2026-09-01T00:00:00Z",
};

const remediationWork: MissionContinueWork = {
  ...normalWork,
  work_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  intent_type: "remediate_class",
  goal_text: "Rebuild fraction comparison fluency with guided visual models",
  subject: "Mathematics",
  topic: "Fraction comparison",
  target_date: later,
};

function missionFor(
  work: MissionContinueWork,
  hero: TeacherOsMission["hero_action"]["kind"] = "continue_work",
  pending = 0,
): TeacherOsMission {
  return {
    mission_date: calendarDate(0),
    review: { pending_count: pending },
    preparation: { active_work_count: 1, continue_work: work },
    hero_action:
      hero === "continue_work"
        ? { kind: "continue_work", work_id: work.work_id }
        : hero === "review"
          ? { kind: "review", work_id: null }
          : { kind: "prepare_tomorrow", work_id: null },
  };
}

describe("remediation-aware Mission copy", () => {
  it("detects remediate_class without exposing the enum in teacher copy", () => {
    expect(isRemediationContinueWork(remediationWork)).toBe(true);
    expect(isRemediationContinueWork(normalWork)).toBe(false);

    const headline = continueWorkHeadline(remediationWork, tomorrow);
    expect(headline).toBe("Continue the follow-up for Fraction comparison");
    expect(headline).not.toMatch(/remediate_class/);
    expect(continueWorkActionLabel(remediationWork)).toBe(
      "Continue remediation preparation",
    );
    expect(continueWorkActionLabel(remediationWork)).not.toMatch(
      /remediate_class/,
    );
  });

  it("keeps ordinary prepare_tomorrow copy unchanged", () => {
    expect(continueWorkHeadline(normalWork, tomorrow)).toBe(
      "Continue tomorrow's Photosynthesis preparation",
    );
    expect(continueWorkActionLabel(normalWork)).toBe("Continue preparation");
    expect(
      preparationSentence(missionFor(normalWork), tomorrow),
    ).toBe(
      "Preparation for tomorrow is in progress — Photosynthesis: Explain why leaves look green",
    );
    expect(continueWorkSecondaryHeading(normalWork)).toBe("Preparation");
  });

  it("uses class-improvement language for remediation secondary rows", () => {
    expect(
      preparationSentence(missionFor(remediationWork), tomorrow),
    ).toBe(
      `Class improvement for the lesson on ${later} is in progress — Fraction comparison: Rebuild fraction comparison fluency with guided visual models`,
    );
    expect(continueWorkSecondaryHeading(remediationWork)).toBe(
      "Class improvement",
    );
  });

  it("continue_work hero prefers remediation CTA and goal detail", () => {
    const hero = missionHero(missionFor(remediationWork), tomorrow);
    expect(hero.headline).toBe(
      "Continue the follow-up for Fraction comparison",
    );
    expect(hero.detail).toContain(
      "Rebuild fraction comparison fluency with guided visual models",
    );
    expect(hero.actionLabel).toBe("Continue remediation preparation");
    expect(hero.actionTo).toBe(
      `/teacher-os/work/${remediationWork.work_id}`,
    );
    expect(JSON.stringify(hero)).not.toMatch(/remediate_class/);
  });

  it("review hero remains highest priority while remediation Also-open label stays distinct", () => {
    const hero = missionHero(
      missionFor(remediationWork, "review", 2),
      tomorrow,
    );
    expect(hero.headline).toBe("2 items waiting for review");
    expect(hero.actionLabel).toBe("Open review queue");
    expect(hero.actionTo).toBe("/teacher-os/review");
    expect(continueWorkActionLabel(remediationWork)).toBe(
      "Continue remediation preparation",
    );
  });
});
