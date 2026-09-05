/**
 * A Teaching Intent is the request that enters Work creation. It is never
 * persisted on its own, so nothing here is cached or stored in the browser.
 */
export const INTENT_TYPE = "prepare_tomorrow" as const;

export const DEFAULT_LOCALE = "en-IN";

/** Confirmation summary: intent · class · subject · topic · date. */
export function summaryParts(input: {
  classLabel: string;
  subject: string;
  topic: string;
  targetDate: string;
  tomorrow: string;
}): string[] {
  const parts = [
    input.targetDate === input.tomorrow ? "Prepare tomorrow" : "Prepare",
  ];
  for (const value of [input.classLabel, input.subject, input.topic]) {
    const trimmed = value.trim();
    if (trimmed) parts.push(trimmed);
  }
  parts.push(input.targetDate);
  return parts;
}
