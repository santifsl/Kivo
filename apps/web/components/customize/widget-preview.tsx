import { APP_NAME, DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@kivo/shared";
import { useId, useState } from "react";
import { cn } from "../ui/cn";
import { GlassPanel } from "../ui/glass-panel";
import styles from "./widget-preview.module.css";

export function WidgetPreview({ config }: { config: WidgetConfig }) {
  const [open, setOpen] = useState(true);
  const panelId = useId();
  const top = config.position.startsWith("top");
  const left = config.position.endsWith("left");
  const label = config.label.trim() || DEFAULT_WIDGET_CONFIG.label;
  const header = config.header_text.trim() || DEFAULT_WIDGET_CONFIG.header_text;

  return (
    <GlassPanel
      as="section"
      aria-labelledby="widget-preview-heading"
      className="min-w-0 overflow-hidden"
    >
      <div className="border-b border-line px-4 py-3 sm:px-6">
        <h3 id="widget-preview-heading" className="font-medium text-ink">
          Live preview
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          Toggle the chat button to try the opening animation.
        </p>
      </div>
      <div className={cn("relative h-96 overflow-hidden bg-canvas", styles.stage)}>
        <div
          className={cn(
            "absolute inset-x-3 flex gap-3 sm:inset-x-5",
            top ? "top-4 flex-col" : "bottom-4 flex-col-reverse",
            left ? "items-start" : "items-end",
          )}
        >
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            className="ph-no-capture min-h-12 max-w-full rounded-full px-5 py-2 text-[15px] font-semibold wrap-anywhere text-white shadow-glass-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            style={{ backgroundColor: config.button_color }}
            onClick={() => setOpen((current) => !current)}
          >
            {label}
          </button>
          {open ? (
            <div
              id={panelId}
              key={config.animation}
              data-animation={config.animation}
              className={cn(
                "flex h-60 w-full max-w-80 flex-col overflow-hidden rounded-lg border border-line bg-glass-strong shadow-glass-lg",
                styles.panel,
              )}
              style={{ transformOrigin: config.position.replace("-", " ") }}
            >
              <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm bg-ink" />
                <p className="ph-no-capture text-sm font-semibold wrap-anywhere text-ink">
                  {header}
                </p>
              </div>
              <p className="m-auto px-4 text-center text-sm text-ink-muted">
                Ask a question and we&apos;ll answer right away.
              </p>
              <div
                aria-hidden="true"
                className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs"
              >
                <span className="min-w-0 flex-1 rounded-md border border-line bg-wash px-2 py-2 text-ink-muted">
                  Ask a question…
                </span>
                <span className="rounded-md bg-accent px-3 py-2 text-accent-ink">Send</span>
              </div>
              {config.show_badge ? (
                <p className="pb-2 text-center text-xs text-ink-muted">Powered by {APP_NAME}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </GlassPanel>
  );
}
