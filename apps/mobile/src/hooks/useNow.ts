import { useEffect, useState } from 'react';

/** Re-renders on an interval while `active`, for countdowns. */
export function useNow(active: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs]);
  return now;
}
