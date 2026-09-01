/**
 * UX-side learner-assignable Content type policy.
 * Backend remains final authority; unknown kinds fail closed.
 */
const LEARNER_ASSIGNABLE_CONTENT_TYPES = new Set([
  "worksheet",
  "quiz",
  "homework",
]);

export function isLearnerAssignableArtifact(
  contentType: string | null | undefined,
): boolean {
  if (!contentType) return false;
  return LEARNER_ASSIGNABLE_CONTENT_TYPES.has(contentType);
}

export function canAssignPublishedVersion(options: {
  contentType: string | null | undefined;
  publishedVersionId: string | null | undefined;
  viewedVersionId: string | null | undefined;
}): boolean {
  if (!options.viewedVersionId) return false;
  if (options.publishedVersionId !== options.viewedVersionId) return false;
  return isLearnerAssignableArtifact(options.contentType);
}
