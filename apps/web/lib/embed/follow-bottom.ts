import { useCallback, useLayoutEffect, useRef } from "react";

/** How close to the bottom (px) still counts as "at the bottom". */
export const FOLLOW_THRESHOLD_PX = 48;

type ScrollBox = Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight">;

export function isNearBottom(el: ScrollBox, threshold = FOLLOW_THRESHOLD_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

/**
 * Keeps a scroll container pinned to its newest content while the reader is at the bottom,
 * and leaves their position alone once they scroll up. `trigger` changes whenever content is
 * added; `follow()` re-pins (e.g. when the visitor sends a message).
 */
export function useFollowBottom<T extends HTMLElement>(trigger: unknown) {
  const ref = useRef<T>(null);
  const stick = useRef(true);

  const onScroll = useCallback(() => {
    if (ref.current) stick.current = isNearBottom(ref.current);
  }, []);
  const follow = useCallback(() => {
    stick.current = true;
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [trigger]);

  return { ref, onScroll, follow };
}
