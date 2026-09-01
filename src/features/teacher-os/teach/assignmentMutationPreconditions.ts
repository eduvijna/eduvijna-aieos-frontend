import {
  getTeachingAssignment,
  type TeachingAssignmentResponse,
} from "@/services/api/teachingAssignmentsApi";
import { isActiveAssignment } from "./assignmentPresentation";

export type FreshAssignmentSnapshot = {
  assignment: TeachingAssignmentResponse;
  etag: string;
};

export class MissingAssignmentEtagError extends Error {
  constructor() {
    super("Assignment GET returned no ETag (client contract error).");
    this.name = "MissingAssignmentEtagError";
  }
}

/**
 * Always performs a fresh GET before a governed mutation precondition.
 * Never reuses a caller-supplied cached ETag.
 */
export async function fetchFreshAssignmentForMutation(
  assignmentId: string,
): Promise<FreshAssignmentSnapshot> {
  const response = await getTeachingAssignment(assignmentId);
  if (!response.etag) {
    throw new MissingAssignmentEtagError();
  }
  return {
    assignment: response.data,
    etag: response.etag,
  };
}

export function isFreshAssignmentActive(
  snapshot: FreshAssignmentSnapshot,
): boolean {
  return isActiveAssignment(snapshot.assignment);
}
