import { differenceInMinutes } from 'date-fns';

export interface CompletedTicket {
  id?: string | number;
  service_start_time?: string | null; // ISO 8601 timestamp
  service_end_time?: string | null;   // ISO 8601 timestamp
}

/**
 * Calculate estimated wait time (minutes) based on the average service duration
 * of the last `lookback` completed tickets multiplied by the user's queue position.
 *
 * - completedTickets: array of completed tickets (must include service_start_time and service_end_time)
 * - queuePosition: 1-based number of people ahead in the queue (e.g., 1 means one person ahead)
 * - lookback: how many of the most recent completed tickets to average (default 5)
 * - fallbackPerPersonMinutes: minutes to assume per person if there is no valid history (default 15)
 *
 * Returns the estimated wait time in whole minutes (rounded up). Returns 0 if invalid queuePosition.
 */
export function calculateEstimatedWaitTime(
  completedTickets: CompletedTicket[],
  queuePosition: number,
  lookback = 5,
  fallbackPerPersonMinutes = 15,
): number {
  // Validate queue position
  if (!Number.isFinite(queuePosition) || queuePosition <= 0) return 0;

  // If no history, return fallback per-person estimate
  if (!Array.isArray(completedTickets) || completedTickets.length === 0) {
    return Math.max(0, Math.ceil(fallbackPerPersonMinutes * queuePosition));
  }

  // Normalize and filter valid completed tickets
  const parsed = completedTickets
    .filter((t) => t.service_start_time && t.service_end_time)
    .map((t) => ({ start: t.service_start_time as string, end: t.service_end_time as string }))
    .filter((t) => {
      const start = Date.parse(t.start);
      const end = Date.parse(t.end);
      return !Number.isNaN(start) && !Number.isNaN(end) && end >= start;
    })
    .sort((a, b) => Date.parse(b.end) - Date.parse(a.end)) // newest first by end time
    .slice(0, lookback);

  if (parsed.length === 0) {
    return Math.max(0, Math.ceil(fallbackPerPersonMinutes * queuePosition));
  }

  // Compute durations (in minutes) using date-fns for clarity and correctness
  const durations = parsed
    .map((t) => differenceInMinutes(new Date(t.end), new Date(t.start)))
    .filter((d) => Number.isFinite(d) && d > 0);

  if (durations.length === 0) {
    return Math.max(0, Math.ceil(fallbackPerPersonMinutes * queuePosition));
  }

  const avgMinutes = durations.reduce((s, d) => s + d, 0) / durations.length;

  // Estimated total wait = average minutes per ticket * number of tickets ahead
  const estimated = avgMinutes * queuePosition;

  // Round up to avoid under-estimating; ensure non-negative
  return Math.max(0, Math.ceil(estimated));
}

// Example usage:
// const wait = calculateEstimatedWaitTime(completedTicketsArray, 3);
// console.log(`Estimated wait: ${wait} minutes`);

// Backwards-compatible alias requested by some callers
export const calculatePredictedWaitTime = calculateEstimatedWaitTime;
