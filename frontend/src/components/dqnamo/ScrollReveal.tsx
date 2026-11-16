import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  /** Optional subtle entrance stagger in ms (clamped <= 220ms for snappy feel) */
  delayMs?: number;
  /** Optional test ID forwarded to the wrapper */
  'data-testid'?: string;
}

/**
 * Lightweight, 60fps GPU-composited scroll-reveal container.
 * Uses a single IntersectionObserver per card (once: true), animates strictly
 * `opacity` + `translate3d`, preserves exact layout dimensions (`CLS = 0`),
 * and automatically respects `prefers-reduced-motion`.
 */
export function ScrollReveal({
  children,
  className,
  delayMs = 0,
  'data-testid': testId,
}: ScrollRevealProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (
      typeof window === 'undefined' ||
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setVisible(true);
      return;
    }

    // Above-the-fold cards start revealing immediately without waiting for scroll
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.96) {
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.06, rootMargin: '0px 0px -18px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const clampedDelay = Math.min(Math.max(delayMs, 0), 220);

  return (
    <div
      ref={ref}
      data-testid={testId}
      style={clampedDelay > 0 ? { transitionDelay: `${clampedDelay}ms` } : undefined}
      className={cn('zona-reveal', visible && 'is-visible', className)}
    >
      {children}
    </div>
  );
}

