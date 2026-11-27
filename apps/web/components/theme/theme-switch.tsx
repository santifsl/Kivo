"use client";

import { type LucideIcon, Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "../ui/cn";
import {
  DEFAULT_THEME,
  THEME_CHANGE_EVENT,
  type ThemeChoice,
  readThemeChoice,
  setThemeChoice,
} from "./theme";

const OPTIONS: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

export type ThemeSwitchViewProps = {
  value: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
  className?: string;
};

/** The three-option segmented control, drawn from props (testable without a browser). */
export function ThemeSwitchView({ value, onChange, className }: ThemeSwitchViewProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-line bg-wash p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value: option, label, icon: Icon }) => {
        const checked = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            title={label}
            data-theme-option={option}
            onClick={() => onChange(option)}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-full transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
              checked ? "bg-card text-ink shadow-sm" : "text-ink-muted hover:text-ink",
            )}
          >
            <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}

/** Light / Dark / System. Saves the choice and applies it right away. */
export function ThemeSwitch({ className }: { className?: string }) {
  const value = useSyncExternalStore(subscribe, readThemeChoice, () => DEFAULT_THEME);
  return <ThemeSwitchView value={value} onChange={setThemeChoice} className={className} />;
}
