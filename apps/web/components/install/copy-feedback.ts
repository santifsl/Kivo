/** How long "Copied" (or "Copy failed") stays before the button says "Copy" again. */
export const COPY_FEEDBACK_MS = 2000;

export type CopyStatus = "idle" | "copied" | "failed";

/**
 * The copy button's status timer, apart from React so it can be tested with fake timers.
 * `show` sets a status and schedules the reset; a second copy restarts the countdown.
 */
export function createCopyFeedback(setStatus: (status: CopyStatus) => void, delay = COPY_FEEDBACK_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    show(status: Exclude<CopyStatus, "idle">) {
      clearTimeout(timer);
      setStatus(status);
      timer = setTimeout(() => {
        timer = undefined;
        setStatus("idle");
      }, delay);
    },
    dispose() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
