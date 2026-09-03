import {
  getTeachingExecution,
  type TeachingExecutionResponse,
} from "@/services/api/teachingExecutionsApi";

export type FreshExecutionSnapshot = {
  execution: TeachingExecutionResponse;
  etag: string;
};

export class MissingExecutionEtagError extends Error {
  constructor() {
    super("Execution GET returned no ETag (client contract error).");
    this.name = "MissingExecutionEtagError";
  }
}

/**
 * Always performs a fresh GET before a governed mutation precondition.
 * Never reuses a caller-supplied cached ETag.
 */
export async function fetchFreshExecutionForMutation(
  executionId: string,
): Promise<FreshExecutionSnapshot> {
  const response = await getTeachingExecution(executionId);
  if (!response.etag) {
    throw new MissingExecutionEtagError();
  }
  return {
    execution: response.data,
    etag: response.etag,
  };
}
