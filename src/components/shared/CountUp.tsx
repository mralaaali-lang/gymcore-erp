import { useEffect, useRef, useState } from 'react';
import { fmtNum } from '../../utils/date';

interface CountUpProps {
  /** The number to arrive at. Re-animates from the displayed value when it changes. */
  value: number;
  /** Renders each frame. Defaults to the app's grouped-western formatter (`fmtNum`). */
  format?: (n: number) => string;
  /** ms; 700 keeps a KPI legible without holding the dashboard hostage. */
  duration?: number;
  className?: string;
  /** Decimal control, forwarded to the default formatter only. */
  digits?: { min?: number; max?: number };
}

/**
 * CountUp — animates a KPI from its previous value to the new one.
 *
 * Only digits move; the string a call site would have rendered stays the
 * authority — pass `format` (e.g. a currency helper) and the frames are rendered
 * through it. Three deliberate behaviours:
 *
 * - `prefers-reduced-motion: reduce` renders the final number instantly. No
 *   tween, no flash of zero.
 * - A value that is not finite (a null from a half-loaded endpoint) renders the
 *   formatter's own fallback instead of animating toward `NaN`.
 * - The tween is interrupted cleanly: a new target starts from wherever the
 *   last frame landed, so refetches do not make the number jump back to zero.
 */
export default function CountUp({
  value,
  format,
  duration = 700,
  className = '',
  digits,
}: CountUpProps) {
  const reduce =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const render = format ?? ((n: number) => fmtNum(n, digits));
  const target = Number(value);

  const [display, setDisplay] = useState<number>(reduce || !isFinite(target) ? target : 0);
  const fromRef = useRef<number>(display);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduce || !isFinite(target)) {
      setDisplay(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic: fast off the mark, settles without a bounce
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      fromRef.current = next;
      setDisplay(next);
      if (t < 1) frameRef.current = requestAnimationFrame(step);
      else {
        fromRef.current = target;
        setDisplay(target);
      }
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, reduce]);

  return <span className={`tabular-nums ${className}`}>{render(display)}</span>;
}
