/**
 * Browser-local calendar dates for the TOS-DEV02 temporary time-zone contract.
 *
 * The backend has no teacher time-zone System of Record yet, so the client sends
 * the local educational day explicitly. Once teacher time zones are governed,
 * the server derives the day and these helpers become unnecessary.
 */

/** Format a Date as YYYY-MM-DD using its *local* calendar fields, not UTC. */
export function toCalendarDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localToday(now: Date = new Date()): string {
  return toCalendarDate(now);
}

export function localTomorrow(now: Date = new Date()): string {
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return toCalendarDate(tomorrow);
}
