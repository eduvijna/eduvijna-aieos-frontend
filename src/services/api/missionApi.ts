import { apiRequest } from "./client";
import type { TeacherOsMission } from "./generated/teachingTypes";

/**
 * Read Today's Mission for one local educational day.
 *
 * `mission_date` is a temporary TOS-DEV02 contract: the client supplies the
 * calendar date because no teacher time-zone System of Record exists yet.
 */
export async function getTodayMission(missionDate: string) {
  return apiRequest<TeacherOsMission>("/api/v1/teacher-os/today/mission", {
    method: "GET",
    query: { mission_date: missionDate },
  });
}
