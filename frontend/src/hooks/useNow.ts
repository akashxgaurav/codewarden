import { useEffect, useState } from "react";

/**
 * The current time, refreshed on an interval.
 *
 * The dashboard compares periods of days, so it needs a "now" that moves on
 * its own. Reading the clock while rendering would make the component impure,
 * so the value is kept in state and refreshed by a timer.
 */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
