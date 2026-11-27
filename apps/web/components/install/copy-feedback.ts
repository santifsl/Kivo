/** How long "Copied" (or "Copy failed") stays before the button says "Copy" again. */
export const COPY_FEEDBACK_MS = 2000;

export type CopyStatus = "idle" | "copied" | "failed";

/**
 * The copy button's status timer, apart from React so it can be tested with fake timers.
 * `show` sets a status and schedules the reset; a second copy restarts the countdown.
 * After `dispose` (the button unmounted), `show` does nothing: a clipboard write
 * that settles later must not set state or start a timer.
 */
export function createCopyFeedback(setStatus: (status: CopyStatus) => void, delay = COPY_FEEDBACK_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  return {
    show(status: Exclude<CopyStatus, "idle">) {
      if (disposed) return;
      clearTimeout(timer);
      setStatus(status);
      timer = setTimeout(() => {
        timer = undefined;
        setStatus("idle");
      }, delay);
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
