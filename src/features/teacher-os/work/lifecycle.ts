import type { WorkArtifactItem } from "@/services/api/generated/teachingTypes";
import { stewardshipStatusLabel } from "./stewardshipLabel";

const WORK_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bounded return target — only a Teaching Work UUID, never an arbitrary URL. */
export function safeWorkReturnPath(fromWork: string | null | undefined): string | null {
  if (!fromWork || !WORK_ID_RE.test(fromWork)) return null;
  return `/teacher-os/work/${fromWork}`;
}

export function reviewPathForArtifact(
  item: Pick<WorkArtifactItem, "content_id" | "version_id">,
  workId?: string | null,
): string {
  const base = `/teacher-os/review/${item.content_id}/versions/${item.version_id}`;
  if (workId && WORK_ID_RE.test(workId)) {
    return `${base}?fromWork=${encodeURIComponent(workId)}`;
  }
  return base;
}

export function artifactViewPath(
  workId: string,
  item: Pick<WorkArtifactItem, "content_id" | "version_id">,
): string {
  return `/teacher-os/work/${workId}/artifacts/${item.content_id}/versions/${item.version_id}`;
}

/** Authoritative Generic Content facts needed for publication truth. */
export type ContentPublicationFacts = {
  stewardship_state: string;
  current_version_id: string | null;
  published_version_id: string | null;
};

export type ResolvedLifecycleKind =
  | "published"
  | "in_review"
  | "approved"
  | "other";

export type ArtifactLifecycleActions = {
  kind: ResolvedLifecycleKind;
  label: string;
  showReview: boolean;
  showView: boolean;
  showPublish: boolean;
};

/**
 * Resolve display lifecycle from Work generation-bound version + Content facts.
 *
 * Published is NOT a stewardship state. Publication truth is solely:
 * `published_version_id === generationBoundVersionId`.
 */
export function resolveArtifactLifecycle(
  generationBoundVersionId: string,
  workStewardshipState: string,
  content: ContentPublicationFacts | null | undefined,
): ArtifactLifecycleActions {
  if (content?.published_version_id === generationBoundVersionId) {
    return {
      kind: "published",
      label: "Published",
      showReview: false,
      showView: true,
      showPublish: false,
    };
  }

  if (workStewardshipState === "IN_REVIEW") {
    return {
      kind: "in_review",
      label: "In Review",
      showReview: true,
      showView: false,
      showPublish: false,
    };
  }

  if (workStewardshipState === "APPROVED") {
    const currentMatches =
      content != null &&
      content.current_version_id === generationBoundVersionId;
    return {
      kind: "approved",
      label: "Approved",
      showReview: false,
      showView: true,
      // Fail closed until Content is hydrated and current version matches.
      showPublish: currentMatches,
    };
  }

  return {
    kind: "other",
    label: stewardshipStatusLabel(workStewardshipState),
    showReview: false,
    showView: false,
    showPublish: false,
  };
}

/**
 * Artifact viewer uses authoritative Content stewardship + publication pointer
 * (Work projection is not loaded on this route).
 */
export function resolveContentVersionLifecycle(
  generationBoundVersionId: string,
  content: ContentPublicationFacts,
): ArtifactLifecycleActions {
  if (content.published_version_id === generationBoundVersionId) {
    return {
      kind: "published",
      label: "Published",
      showReview: false,
      showView: true,
      showPublish: false,
    };
  }

  if (content.stewardship_state === "IN_REVIEW") {
    return {
      kind: "in_review",
      label: "In Review",
      showReview: true,
      showView: false,
      showPublish: false,
    };
  }

  if (content.stewardship_state === "APPROVED") {
    const currentMatches =
      content.current_version_id === generationBoundVersionId;
    return {
      kind: "approved",
      label: "Approved",
      showReview: false,
      showView: true,
      showPublish: currentMatches,
    };
  }

  return {
    kind: "other",
    label: stewardshipStatusLabel(content.stewardship_state),
    showReview: false,
    showView: false,
    showPublish: false,
  };
}

export type ArtifactLifecycleSummary = {
  total: number;
  inReview: number;
  approved: number;
  published: number;
  other: number;
};

/** Display projection only — never persist. Counts use resolved lifecycle. */
export function summarizeResolvedLifecycle(
  resolutions: ArtifactLifecycleActions[],
): ArtifactLifecycleSummary {
  let inReview = 0;
  let approved = 0;
  let published = 0;
  let other = 0;
  for (const resolution of resolutions) {
    switch (resolution.kind) {
      case "in_review":
        inReview += 1;
        break;
      case "approved":
        approved += 1;
        break;
      case "published":
        published += 1;
        break;
      default:
        other += 1;
    }
  }
  return {
    total: resolutions.length,
    inReview,
    approved,
    published,
    other,
  };
}

export function formatArtifactLifecycleSummary(
  summary: ArtifactLifecycleSummary,
): string {
  const parts = [`${summary.total} artifact${summary.total === 1 ? "" : "s"}`];
  if (summary.inReview > 0) {
    parts.push(`${summary.inReview} in review`);
  }
  if (summary.approved > 0) {
    parts.push(`${summary.approved} approved`);
  }
  if (summary.published > 0) {
    parts.push(`${summary.published} published`);
  }
  if (summary.other > 0) {
    parts.push(`${summary.other} other`);
  }
  return parts.join(" · ");
}

export function publicationStatusLabel(
  content: ContentPublicationFacts,
  versionId: string,
): string {
  if (content.published_version_id === versionId) {
    return "Published";
  }
  if (content.published_version_id) {
    return "Another version is published";
  }
  return stewardshipStatusLabel(content.stewardship_state);
}
