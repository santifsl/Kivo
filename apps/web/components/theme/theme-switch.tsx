"use client";

import { type LucideIcon, Monitor, Moon, Sun } from "lucide-react";
import { useId, useSyncExternalStore } from "react";
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

/**
 * The three-option segmented control, drawn from props (testable without a browser).
 * Native radio inputs: one tab stop, arrow keys move and select, as screen readers expect.
 */
export function ThemeSwitchView({ value, onChange, className }: ThemeSwitchViewProps) {
  const name = useId();
  return (
    <fieldset
      className={cn(
        "m-0 inline-flex min-w-0 items-center gap-0.5 rounded-full border border-line bg-wash p-0.5",
        className,
      )}
    >
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map(({ value: option, label, icon: Icon }) => {
        const checked = option === value;
        return (
          <label
            key={option}
            title={label}
            data-theme-option={option}
            className={cn(
              "inline-flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-brand",
              checked ? "bg-card text-ink shadow-sm" : "text-ink-muted hover:text-ink",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={checked}
              aria-label={label}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </label>
        );
      })}
    </fieldset>
  );
}

/** Light / Dark / System. Saves the choice and applies it right away. */
export function ThemeSwitch({ className }: { className?: string }) {
  const value = useSyncExternalStore(subscribe, readThemeChoice, () => DEFAULT_THEME);
  return <ThemeSwitchView value={value} onChange={setThemeChoice} className={className} />;
}
