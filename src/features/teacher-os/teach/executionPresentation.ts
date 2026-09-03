import type {
  TeachingExecutionObservationResponse,
  TeachingExecutionResponse,
} from "@/services/api/teachingExecutionsApi";

/** Opaque revision ETag encoding used by AIEOS (`"r{n}"`, quotes included). */
export function revisionEtag(revision: number): string {
  return `"r${revision}"`;
}

export function formatExecutionInstant(
  iso: string | null | undefined,
): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const LIFECYCLE_LABELS: Record<string, string> = {
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** Text label for lifecycle — never rely on colour alone. */
export function formatExecutionLifecycleLabel(state: string): string {
  return LIFECYCLE_LABELS[state] ?? state;
}

export function isExecutionInProgress(
  execution: Pick<TeachingExecutionResponse, "lifecycle_state">,
): boolean {
  return execution.lifecycle_state === "IN_PROGRESS";
}

export function isExecutionTerminal(
  execution: Pick<TeachingExecutionResponse, "lifecycle_state">,
): boolean {
  return (
    execution.lifecycle_state === "COMPLETED" ||
    execution.lifecycle_state === "CANCELLED"
  );
}

export const OBSERVATION_KINDS = [
  "PRIVATE_EXECUTION_NOTE",
  "CLASS_OBSERVATION",
] as const;

export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

const OBSERVATION_KIND_LABELS: Record<ObservationKind, string> = {
  PRIVATE_EXECUTION_NOTE: "Private execution note",
  CLASS_OBSERVATION: "Class observation",
};

export function formatObservationKindLabel(kind: string): string {
  if (kind === "PRIVATE_EXECUTION_NOTE" || kind === "CLASS_OBSERVATION") {
    return OBSERVATION_KIND_LABELS[kind];
  }
  return kind;
}

export function isAllowedObservationKind(kind: string): kind is ObservationKind {
  return (
    kind === "PRIVATE_EXECUTION_NOTE" || kind === "CLASS_OBSERVATION"
  );
}

export function observationRevisionEtag(
  observation: Pick<TeachingExecutionObservationResponse, "revision">,
): string {
  return revisionEtag(observation.revision);
}
