"use client";

import { useEffect } from "react";
import {
  DARK_QUERY,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  forgetUnsavedChoice,
  syncTheme,
} from "./theme";

/**
 * Keeps <html> on the right theme after the first paint: when the OS switches
 * light/dark (for "System"), and when another tab changes the choice. Renders
 * nothing. Mounted once in the root layout.
 */
export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === THEME_STORAGE_KEY) {
        forgetUnsavedChoice();
        syncTheme();
        window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
      }
    };
    media.addEventListener("change", syncTheme);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", syncTheme);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}
