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
