/**
 * Years offered by the profile date pickers.
 *
 * Computed once at module load so the options stay current instead of being
 * hard-coded in each section: 1960 through the current calendar year + 5, in
 * ascending order.
 */
const FIRST_YEAR = 1960;
const LAST_YEAR = new Date().getFullYear() + 5;

export const YEARS: string[] = Array.from(
  { length: LAST_YEAR - FIRST_YEAR + 1 },
  (_, index) => String(FIRST_YEAR + index),
);

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Warn when an end date precedes the start date. Empty years and "current"
 * entries are valid and return null.
 */
export function rangeWarning(
  startYear: string,
  startMonth: string,
  endYear: string | undefined,
  endMonth: string | undefined,
  isCurrent?: boolean,
): string | null {
  if (isCurrent || !startYear || !endYear) return null;
  const start = Number(startYear) * 12 + Math.max(0, MONTHS.indexOf(startMonth));
  const end = Number(endYear) * 12 + Math.max(0, MONTHS.indexOf(endMonth ?? ""));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return end < start ? "End date is before the start date." : null;
}
