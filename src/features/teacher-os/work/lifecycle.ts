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

export type ArtifactLifecycleActions = {
  label: string;
  showReview: boolean;
  showView: boolean;
  showPublish: boolean;
};

/**
 * Fail-closed action matrix from authoritative stewardship_state.
 * Never invent Publish from artifact kind alone.
 */
export function artifactLifecycleActions(
  stewardshipState: string,
): ArtifactLifecycleActions {
  switch (stewardshipState) {
    case "IN_REVIEW":
      return {
        label: stewardshipStatusLabel(stewardshipState),
        showReview: true,
        showView: false,
        showPublish: false,
      };
    case "APPROVED":
      return {
        label: stewardshipStatusLabel(stewardshipState),
        showReview: false,
        showView: true,
        showPublish: true,
      };
    case "PUBLISHED":
      return {
        label: stewardshipStatusLabel(stewardshipState),
        showReview: false,
        showView: true,
        showPublish: false,
      };
    default:
      return {
        label: stewardshipStatusLabel(stewardshipState),
        showReview: false,
        showView: false,
        showPublish: false,
      };
  }
}

export type ArtifactLifecycleSummary = {
  total: number;
  inReview: number;
  approved: number;
  published: number;
  other: number;
};

/** Display projection only — never persist. */
export function summarizeArtifactLifecycle(
  items: WorkArtifactItem[],
): ArtifactLifecycleSummary {
  let inReview = 0;
  let approved = 0;
  let published = 0;
  let other = 0;
  for (const item of items) {
    switch (item.stewardship_state) {
      case "IN_REVIEW":
        inReview += 1;
        break;
      case "APPROVED":
        approved += 1;
        break;
      case "PUBLISHED":
        published += 1;
        break;
      default:
        other += 1;
    }
  }
  return {
    total: items.length,
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
    parts.push(
      `${summary.inReview} in review`,
    );
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
  content: {
    stewardship_state: string;
    published_version_id: string | null;
  },
  versionId: string,
): string {
  if (
    content.stewardship_state === "PUBLISHED" &&
    content.published_version_id === versionId
  ) {
    return "Published";
  }
  if (content.published_version_id === versionId) {
    return "Published (this version)";
  }
  if (content.published_version_id) {
    return "Another version is published";
  }
  return stewardshipStatusLabel(content.stewardship_state);
}
