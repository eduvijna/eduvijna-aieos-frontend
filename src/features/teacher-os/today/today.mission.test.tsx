import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  calendarDate,
  missionWithContinueWork,
  missionWithPrepareTomorrow,
  missionWithReview,
  mockJsonResponse,
  renderApp,
  sampleContinueWork,
  sampleWork,
  stubFetch,
} from "@/test/test-utils";
import type { TeacherOsMission } from "@/services/api/generated/teachingTypes";

function stubMission(mission: TeacherOsMission) {
  return stubFetch(() => mockJsonResponse(mission));
}

describe("B. Today is Mission-first", () => {
  it("lands on the Mission and reads it for the browser's local calendar date", async () => {
    const calls = stubMission(missionWithPrepareTomorrow());

    renderApp("/teacher-os/today");

    expect(
      await screen.findByRole("heading", { level: 1, name: /Today's Mission/i }),
    ).toBeInTheDocument();

    const missionCall = calls.find((call) =>
      call.url.startsWith("/api/v1/teacher-os/today/mission"),
    );
    expect(missionCall).toBeDefined();
    expect(missionCall?.method).toBe("GET");
    expect(missionCall?.url).toContain(`mission_date=${calendarDate(0)}`);
  });

  it("shows an honest unavailable state without a session", async () => {
    renderApp("/teacher-os/today", null);
    expect(await screen.findByText(/Session required/i)).toBeInTheDocument();
  });

  it("shows an error state when the mission read fails", async () => {
    stubFetch(() =>
      mockJsonResponse({ title: "boom", status: 500 }, { status: 500 }),
    );
    renderApp("/teacher-os/today");
    expect(
      await screen.findByText(/Could not load today's mission/i),
    ).toBeInTheDocument();
  });

  it("invents no timetable, attendance, or school metrics", async () => {
    stubMission(missionWithReview(2));
    renderApp("/teacher-os/today");
    await screen.findByRole("heading", { name: /2 items waiting for review/i });

    const text = document.body.textContent ?? "";
    for (const forbidden of [
      /timetable/i,
      /attendance/i,
      /period \d/i,
      /AI (has )?prepared everything/i,
      /students present/i,
    ]) {
      expect(text).not.toMatch(forbidden);
    }
  });
});

describe("C. Mission hero actions follow the projection", () => {
  it("REVIEW: states the pending count and points at the review queue", async () => {
    stubMission(missionWithReview(3));
    renderApp("/teacher-os/today");

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: /3 items waiting for review/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open review queue/i }),
    ).toHaveAttribute("href", "/teacher-os/review");
  });

  it("REVIEW: uses the singular for one pending item", async () => {
    stubMission(missionWithReview(1));
    renderApp("/teacher-os/today");
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: /^1 item waiting for review$/i,
      }),
    ).toBeInTheDocument();
  });

  it("CONTINUE_WORK: names the preparation and links to the Work", async () => {
    stubMission(missionWithContinueWork());
    renderApp("/teacher-os/today");

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: /Continue tomorrow's Photosynthesis preparation/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Goal: Explain why leaves look green/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Continue preparation/i }),
    ).toHaveAttribute("href", `/teacher-os/work/${sampleWork.work_id}`);
    expect(
      screen.getByText(/No items are waiting for review/i),
    ).toBeInTheDocument();
  });

  it("CONTINUE_WORK: states the real date when the Work is not for tomorrow", async () => {
    const mission = missionWithContinueWork();
    const laterDate = calendarDate(4);
    stubMission({
      ...mission,
      preparation: {
        active_work_count: 1,
        continue_work: { ...sampleContinueWork, target_date: laterDate },
      },
    });
    renderApp("/teacher-os/today");

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: new RegExp(
          `Continue your Photosynthesis preparation for ${laterDate}`,
          "i",
        ),
      }),
    ).toBeInTheDocument();
  });

  it("PREPARE_TOMORROW: says nothing is waiting and links to Prepare", async () => {
    stubMission(missionWithPrepareTomorrow());
    renderApp("/teacher-os/today");

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: /Nothing is waiting\. Prepare tomorrow's lesson\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Help me prepare tomorrow/i }),
    ).toHaveAttribute("href", "/teacher-os/prepare");
    expect(
      screen.getByText(/No preparation is in progress/i),
    ).toBeInTheDocument();
  });

  it("reports several active preparations truthfully", async () => {
    const mission = missionWithContinueWork();
    stubMission({
      ...mission,
      review: { pending_count: 2 },
      preparation: { ...mission.preparation, active_work_count: 3 },
      hero_action: { kind: "review", work_id: null },
    });
    renderApp("/teacher-os/today");

    expect(
      await screen.findByText(/Plus 2 other active preparations/i),
    ).toBeInTheDocument();
  });
});
