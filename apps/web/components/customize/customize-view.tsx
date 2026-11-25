"use client";

import {
  apiErrorSchema,
  updateWidgetConfigRequestSchema,
  WIDGET_ANIMATIONS,
  WIDGET_HEADER_MAX_LENGTH,
  WIDGET_LABEL_MAX_LENGTH,
  WIDGET_POSITIONS,
  widgetConfigSchema,
  type Plan,
  type WidgetConfig,
} from "@kivo/shared";
import { useState, type FormEvent } from "react";
import { Button } from "../ui/button";
import { GlassPanel } from "../ui/glass-panel";
import { WidgetPreview } from "./widget-preview";

const POSITIONS = {
  "bottom-right": "Bottom right",
  "bottom-left": "Bottom left",
  "top-right": "Top right",
  "top-left": "Top left",
};
const ANIMATIONS = { fade: "Fade", slide: "Slide", scale: "Scale" };

const controlClass =
  "h-10 w-full min-w-0 rounded-md border border-line bg-glass-strong px-3 text-base font-normal text-ink focus-visible:outline-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:bg-wash sm:text-sm";
const labelClass = "flex min-w-0 flex-col gap-2 text-sm font-medium text-ink";

type SaveStatus = { phase: "idle" | "saving" | "saved" } | { phase: "error"; message: string };

export function CustomizeView({
  projectId,
  plan,
  config,
}: {
  projectId: string;
  plan: Plan;
  config: WidgetConfig;
}) {
  const [saved, setSaved] = useState(config);
  const [draft, setDraft] = useState(config);
  const [status, setStatus] = useState<SaveStatus>({ phase: "idle" });
  const changes = Object.entries(draft).filter(
    ([field, value]) => saved[field as keyof WidgetConfig] !== value,
  );
  const locked = plan === "free";
  const saving = status.phase === "saving";

  function change<K extends keyof WidgetConfig>(field: K, value: WidgetConfig[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setStatus({ phase: "idle" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || saving || changes.length === 0) return;

    const input = updateWidgetConfigRequestSchema.safeParse(Object.fromEntries(changes));
    if (!input.success) {
      setStatus({ phase: "error", message: "Enter a button label and header text before saving." });
      return;
    }

    setStatus({ phase: "saving" });
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const error = apiErrorSchema.safeParse(body);
        if (!error.success) throw new Error();
        setStatus({ phase: "error", message: error.data.error.message });
        return;
      }

      const next = widgetConfigSchema.parse((body as { config?: unknown } | null)?.config);
      setSaved(next);
      setDraft(next);
      setStatus({ phase: "saved" });
    } catch {
      setStatus({ phase: "error", message: "Couldn't save your changes. Please try again." });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold tracking-tight text-ink">Customize widget</h2>
      <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
        <GlassPanel as="section" aria-label="Widget settings" className="min-w-0 p-4 sm:p-6">
          {locked ? (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-wash p-3 text-sm">
              <p className="text-ink-muted">Widget customization is available on Pro.</p>
              <a
                className="font-medium text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                href="/dashboard/billing"
              >
                Upgrade to Pro
              </a>
            </div>
          ) : null}
          <form onSubmit={save}>
            <fieldset disabled={locked || saving} className="flex min-w-0 flex-col gap-4">
              <legend className="sr-only">Widget settings</legend>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  <span>Button color</span>
                  <span className="flex h-10 items-center gap-2 rounded-md border border-line bg-glass-strong px-2">
                    <input
                      type="color"
                      className="size-7 shrink-0 cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ink disabled:cursor-not-allowed"
                      value={draft.button_color}
                      onChange={(event) => change("button_color", event.currentTarget.value)}
                    />
                    <span aria-hidden="true" className="font-mono text-xs text-ink-muted">
                      {draft.button_color}
                    </span>
                  </span>
                </label>
                <label className={labelClass}>
                  Button position
                  <select
                    className={controlClass}
                    value={draft.position}
                    onChange={(event) =>
                      change("position", event.currentTarget.value as WidgetConfig["position"])
                    }
                  >
                    {WIDGET_POSITIONS.map((position) => (
                      <option key={position} value={position}>
                        {POSITIONS[position]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className={labelClass}>
                Button label
                <input
                  className={controlClass}
                  value={draft.label}
                  onChange={(event) => change("label", event.currentTarget.value)}
                  maxLength={WIDGET_LABEL_MAX_LENGTH}
                  required
                />
              </label>
              <label className={labelClass}>
                Open animation
                <select
                  className={controlClass}
                  value={draft.animation}
                  onChange={(event) =>
                    change("animation", event.currentTarget.value as WidgetConfig["animation"])
                  }
                >
                  {WIDGET_ANIMATIONS.map((animation) => (
                    <option key={animation} value={animation}>
                      {ANIMATIONS[animation]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Header text
                <input
                  className={controlClass}
                  value={draft.header_text}
                  onChange={(event) => change("header_text", event.currentTarget.value)}
                  maxLength={WIDGET_HEADER_MAX_LENGTH}
                  required
                />
              </label>
              <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-ink has-disabled:cursor-not-allowed">
                <input
                  type="checkbox"
                  className="size-4 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  checked={draft.show_badge}
                  onChange={(event) => change("show_badge", event.currentTarget.checked)}
                />
                Show “Powered by” badge
              </label>
            </fieldset>
            {locked ? null : (
              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4">
                <Button type="submit" disabled={changes.length === 0} loading={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
                <p role="status" className="text-sm text-ink-muted">
                  {status.phase === "saved" ? "Changes saved." : ""}
                </p>
                {status.phase === "error" ? (
                  <p role="alert" className="w-full text-sm text-ink">
                    {status.message}
                  </p>
                ) : null}
              </div>
            )}
          </form>
        </GlassPanel>
        <WidgetPreview config={draft} />
      </div>
    </div>
  );
}
