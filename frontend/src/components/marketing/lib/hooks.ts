'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import {
  INITIAL_SEQUENCE,
  PAYMENT_TIMELINE,
  TYPING_DURATION,
  sequenceReducer,
  viewFor,
  type PaymentView,
} from './payment';

/* --------------------------------------------------------------------------
   Motion preference
   -------------------------------------------------------------------------- */

/**
 * Framer's own hook returns null before hydration, which makes it awkward to
 * branch on. This resolves to a definite boolean and stays subscribed.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/* --------------------------------------------------------------------------
   Visibility
   -------------------------------------------------------------------------- */

/**
 * Reports whether an element is meaningfully visible. Scenes use this to start
 * their timeline, pause offscreen media, and settle again on return.
 */
export function useMeaningfullyVisible(
  ref: RefObject<Element | null>,
  ratio = 0.25
): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.intersectionRatio >= ratio),
      { threshold: [0, ratio, Math.min(ratio + 0.15, 1)] }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, ratio]);

  return visible;
}

/** One-shot entrance flag; never flips back once the element has been seen. */
export function useEnteredView(ref: RefObject<Element | null>, ratio = 0.2): boolean {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || entered) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= ratio) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { threshold: [ratio] }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, ratio, entered]);

  return entered;
}

/* --------------------------------------------------------------------------
   Header context: direction, tone under the header, and scrim need
   -------------------------------------------------------------------------- */

export interface HeaderState {
  hidden: boolean;
  tone: 'dark' | 'light';
  scrim: boolean;
  atTop: boolean;
}

/**
 * A single scroll subscriber drives all header behaviour so the foreground can
 * never disagree with the background. Sections declare `data-tone` and
 * `data-scrim`; the header samples whichever section sits under its midline.
 */
export function useHeaderState(midline = 36): HeaderState {
  const [state, setState] = useState<HeaderState>({
    hidden: false,
    tone: 'dark',
    scrim: false,
    atTop: true,
  });

  useEffect(() => {
    let previous = window.scrollY;
    let frame = 0;
    let sections: HTMLElement[] = [];

    const collect = () => {
      sections = Array.from(document.querySelectorAll<HTMLElement>('[data-tone]'));
    };

    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      const atTop = y < 24;

      let tone: 'dark' | 'light' = 'dark';
      for (const section of sections) {
        const rect = section.getBoundingClientRect();
        if (rect.top <= midline && rect.bottom > midline) {
          tone = section.dataset.tone === 'light' ? 'light' : 'dark';
          break;
        }
      }

      setState((current) => {
        // Reverse direction restores the header immediately; downward scroll
        // hides it only once past the first screenful.
        let hidden = current.hidden;
        if (y > previous + 4 && y > 160) hidden = true;
        if (y < previous - 2 || atTop) hidden = false;
        previous = y;

        const nextScrim = !atTop;
        if (
          hidden === current.hidden &&
          tone === current.tone &&
          nextScrim === current.scrim &&
          atTop === current.atTop
        ) {
          return current;
        }
        return { hidden, tone, scrim: nextScrim, atTop };
      });
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    collect();
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    // Sticky scenes mount below the fold; re-collect once they exist.
    const settle = window.setTimeout(collect, 400);

    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.clearTimeout(settle);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [midline]);

  return state;
}

/* --------------------------------------------------------------------------
   Overlay plumbing
   -------------------------------------------------------------------------- */

/** Prevents background scroll without the page jumping to the top. */
export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [locked]);
}

/**
 * Traps Tab inside a container, closes on Escape, and returns focus to the
 * element that opened it.
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void
): void {
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    const focusables = () =>
      Array.from(
        container?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((node) => node.offsetParent !== null || node === document.activeElement);

    const first = focusables()[0];
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      restoreRef.current?.focus?.();
    };
  }, [active, containerRef, onClose]);
}

/** Escape plus outside-pointer dismissal for non-modal panels. */
export function useDismissable(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void
): void {
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      if (container && !container.contains(event.target as Node)) onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [active, containerRef, onClose]);
}

/* --------------------------------------------------------------------------
   Roving tab navigation
   -------------------------------------------------------------------------- */

export interface RovingTabs<T extends string> {
  props: (value: T, index: number) => {
    role: 'tab';
    id: string;
    'aria-selected': boolean;
    'aria-controls': string;
    tabIndex: 0 | -1;
    ref: (node: HTMLButtonElement | null) => void;
    onClick: () => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  };
  panelProps: {
    role: 'tabpanel';
    id: string;
    'aria-labelledby': string;
    tabIndex: 0;
  };
}

/**
 * tablist semantics with arrow, Home, and End support. Selection follows focus,
 * which is the expected pattern for tabs whose panels are already rendered.
 */
export function useRovingTabs<T extends string>(
  values: readonly T[],
  active: T,
  onChange: (value: T) => void,
  idPrefix: string
): RovingTabs<T> {
  const nodes = useRef(new Map<T, HTMLButtonElement>());

  const move = useCallback(
    (index: number) => {
      const next = values[(index + values.length) % values.length];
      onChange(next);
      nodes.current.get(next)?.focus();
    },
    [values, onChange]
  );

  return useMemo(
    () => ({
      props: (value: T, index: number) => ({
        role: 'tab' as const,
        id: `${idPrefix}-tab-${value}`,
        'aria-selected': value === active,
        'aria-controls': `${idPrefix}-panel`,
        tabIndex: (value === active ? 0 : -1) as 0 | -1,
        ref: (node: HTMLButtonElement | null) => {
          if (node) nodes.current.set(value, node);
          else nodes.current.delete(value);
        },
        onClick: () => onChange(value),
        onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
          switch (event.key) {
            case 'ArrowRight':
            case 'ArrowDown':
              event.preventDefault();
              move(index + 1);
              break;
            case 'ArrowLeft':
            case 'ArrowUp':
              event.preventDefault();
              move(index - 1);
              break;
            case 'Home':
              event.preventDefault();
              move(0);
              break;
            case 'End':
              event.preventDefault();
              move(values.length - 1);
              break;
            default:
              break;
          }
        },
      }),
      panelProps: {
        role: 'tabpanel' as const,
        id: `${idPrefix}-panel`,
        'aria-labelledby': `${idPrefix}-tab-${active}`,
        tabIndex: 0 as const,
      },
    }),
    [values, active, onChange, idPrefix, move]
  );
}

/* --------------------------------------------------------------------------
   Copy to clipboard
   -------------------------------------------------------------------------- */

export function useCopy(resetAfter = 1500): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(
    (text: string) => {
      const done = () => {
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), resetAfter);
      };
      navigator.clipboard?.writeText(text).then(done).catch(done);
    },
    [resetAfter]
  );

  return [copied, copy];
}

/* --------------------------------------------------------------------------
   The payment sequence orchestrator
   -------------------------------------------------------------------------- */

export interface PaymentSequence extends PaymentView {
  replay: () => void;
  /** 0 → 1 across the typing window, for the command typewriter. */
  typedRatio: number;
  finished: boolean;
}

/**
 * Owns every timer in the hero story. The sequence starts when the scene is
 * meaningfully visible, banks its elapsed time when the scene leaves, and
 * resumes from that point when it returns. Reduced motion jumps straight to the
 * completed receipt so the whole story is still readable.
 */
export function usePaymentSequence(active: boolean, reducedMotion: boolean): PaymentSequence {
  const [sequence, dispatch] = useReducer(sequenceReducer, INITIAL_SEQUENCE);
  const [runId, setRunId] = useState(0);
  const [typedRatio, setTypedRatio] = useState(0);
  const elapsed = useRef(0);
  const startedAt = useRef(0);

  // Reduced motion receives a complete static scene, with no timers at all.
  useEffect(() => {
    if (!reducedMotion) return;
    dispatch({ type: 'complete' });
    setTypedRatio(1);
  }, [reducedMotion, runId]);

  useEffect(() => {
    if (reducedMotion) return;

    if (!active) {
      if (startedAt.current) {
        elapsed.current += performance.now() - startedAt.current;
        startedAt.current = 0;
      }
      return;
    }

    const next = PAYMENT_TIMELINE[sequence.index + 1];
    if (!next) return;

    startedAt.current = performance.now();
    const delay = Math.max(0, next.at - elapsed.current);
    const id = window.setTimeout(() => {
      elapsed.current = next.at;
      startedAt.current = performance.now();
      dispatch({ type: 'advance' });
    }, delay);

    return () => {
      window.clearTimeout(id);
      if (startedAt.current) {
        elapsed.current += performance.now() - startedAt.current;
        startedAt.current = 0;
      }
    };
  }, [active, reducedMotion, sequence.index, runId]);

  // The command types itself only while the scene is on screen.
  useEffect(() => {
    if (reducedMotion) return;
    if (sequence.state === 'idle') {
      setTypedRatio(0);
      return;
    }
    if (sequence.state !== 'typing') {
      setTypedRatio(1);
      return;
    }
    if (!active) return;

    let frame = 0;
    const begin = performance.now();
    const tick = (now: number) => {
      const ratio = Math.min(1, (now - begin) / TYPING_DURATION);
      setTypedRatio(ratio);
      if (ratio < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, reducedMotion, sequence.state]);

  const replay = useCallback(() => {
    elapsed.current = 0;
    startedAt.current = 0;
    setTypedRatio(0);
    dispatch({ type: 'reset' });
    setRunId((id) => id + 1);
  }, []);

  const view = viewFor(sequence.state);

  return {
    ...view,
    replay,
    typedRatio,
    finished: sequence.index >= PAYMENT_TIMELINE.length - 1,
  };
}
