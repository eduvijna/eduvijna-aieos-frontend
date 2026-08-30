/**
 * Teacher-facing labels for stewardship states returned by the generate / artifacts APIs.
 * Unknown values are shown as returned (never invented).
 */
export function stewardshipStatusLabel(state: string): string {
  switch (state) {
    case "IN_REVIEW":
      return "In Review";
    case "APPROVED":
      return "Approved";
    case "CHANGES_REQUESTED":
      return "Changes requested";
    case "REJECTED":
      return "Rejected";
    case "GENERATED":
      return "Generated";
    case "DRAFT":
      return "Draft";
    case "ARCHIVED":
      return "Archived";
    case "PUBLISHED":
      return "Published";
    default:
      return state;
  }
}
