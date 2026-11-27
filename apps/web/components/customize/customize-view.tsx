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
import { ArrowUpRight, Check, Lock } from "lucide-react";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { Badge } from "../ui/badge";
import { BUTTON_BASE_CLASSES, BUTTON_VARIANT_CLASSES, Button } from "../ui/button";
import { Card } from "../ui/card";
import { cn } from "../ui/cn";
import { FIELD_CLASSES } from "../ui/input";
import { WidgetPreview } from "./widget-preview";

const POSITIONS = {
  "bottom-right": "Bottom right",
  "bottom-left": "Bottom left",
  "top-right": "Top right",
  "top-left": "Top left",
};
const ANIMATIONS = { fade: "Fade", slide: "Slide", scale: "Scale" };

/**
 * One locked look for every control on Free (audit #10): the kit's field style, whose
 * `disabled:` state (dimmed, not-allowed cursor) every control shares. The color picker's box
 * and the checkbox row aren't inputs themselves, so they copy it with `has-disabled:`.
 */
export const CONTROL_CLASSES = cn(FIELD_CLASSES, "h-10 text-base font-normal sm:text-sm");
export const LOCKED_BOX_CLASSES = "has-disabled:cursor-not-allowed has-disabled:opacity-60";
const labelClass = "flex min-w-0 flex-col gap-2 text-sm font-medium text-ink";

export const BILLING_HREF = "/dashboard/billing";
const PRO_FEATURES = [
  "Any button color and corner",
  "Your own button label and header",
  "Slide and scale animations",
  "Hide the “Powered by” badge",
];

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
  const fieldId = useId();
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-3xl leading-display tracking-display text-ink">Customize</h2>
        <p className="text-sm text-ink-muted">Match the chat widget to your site. The preview updates as you type.</p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {locked ? <ProUpsell /> : null}
          <Card as="section" aria-label="Widget settings" className="min-w-0 p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-2">
              <h3 className="text-base font-medium text-ink">Widget settings</h3>
              {locked ? (
                <Badge>
                  <Lock aria-hidden="true" className="size-3" strokeWidth={2} />
                  Pro
                </Badge>
              ) : null}
            </div>
            <form onSubmit={save}>
              <fieldset disabled={locked || saving} className="flex min-w-0 flex-col gap-4">
                <legend className="sr-only">Widget settings</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div className={labelClass}>
                    <label htmlFor={`${fieldId}-color`}>Button color</label>
                    <span
                      className={cn(
                        "flex h-10 items-center gap-2 rounded-md border border-line-strong bg-card px-2",
                        LOCKED_BOX_CLASSES,
                      )}
                    >
                      <input
                        id={`${fieldId}-color`}
                        type="color"
                        className="size-7 shrink-0 cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed"
                        value={draft.button_color}
                        onChange={(event) => change("button_color", event.currentTarget.value)}
                      />
                      <span aria-hidden="true" className="font-mono text-xs text-ink-muted">
                        {draft.button_color}
                      </span>
                    </span>
                  </div>
                  <div className={labelClass}>
                    <label htmlFor={`${fieldId}-position`}>Button position</label>
                    <select
                      id={`${fieldId}-position`}
                      className={CONTROL_CLASSES}
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
                  </div>
                </div>
                <label className={labelClass}>
                  Button label
                  <input
                    className={CONTROL_CLASSES}
                    value={draft.label}
                    onChange={(event) => change("label", event.currentTarget.value)}
                    maxLength={WIDGET_LABEL_MAX_LENGTH}
                    required
                  />
                </label>
                <div className={labelClass}>
                  <label htmlFor={`${fieldId}-animation`}>Open animation</label>
                  <select
                    id={`${fieldId}-animation`}
                    className={CONTROL_CLASSES}
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
                </div>
                <label className={labelClass}>
                  Header text
                  <input
                    className={CONTROL_CLASSES}
                    value={draft.header_text}
                    onChange={(event) => change("header_text", event.currentTarget.value)}
                    maxLength={WIDGET_HEADER_MAX_LENGTH}
                    required
                  />
                </label>
                <label
                  className={cn(
                    "flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-ink",
                    LOCKED_BOX_CLASSES,
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed"
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
                    <p role="alert" className="w-full text-sm text-danger">
                      {status.message}
                    </p>
                  ) : null}
                </div>
              )}
            </form>
          </Card>
        </div>
        <div className="min-w-0 lg:sticky lg:top-6">
          <WidgetPreview config={draft} />
        </div>
      </div>
    </div>
  );
}

/** Free only: what Pro unlocks, and the way to Billing. */
function ProUpsell() {
  return (
    <Card as="section" aria-labelledby="pro-upsell-heading" className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h3 id="pro-upsell-heading" className="text-base font-medium text-ink">
          Make the widget yours with Pro
        </h3>
        <p className="text-sm text-ink-muted">On Free, the widget uses the default look. Pro unlocks every setting below.</p>
      </div>
      <ul className="grid gap-2 text-sm text-ink sm:grid-cols-2">
        {PRO_FEATURES.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={2} />
            {feature}
          </li>
        ))}
      </ul>
      <Link href={BILLING_HREF} className={cn(BUTTON_BASE_CLASSES, BUTTON_VARIANT_CLASSES.primary, "w-fit")}>
        Upgrade to Pro
        <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </Link>
    </Card>
  );
}
