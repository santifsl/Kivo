import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@kivo/shared";
import { useId, useState } from "react";
import { cn } from "../ui/cn";
import { PanelView } from "../embed/panel-view";
import { Card } from "../ui/card";
import styles from "./widget-preview.module.css";

/**
 * Where the launcher sits in the frame: 20 px from both edges of its corner,
 * like the real widget on a page (audit #11).
 */
export const LAUNCHER_INSET = { top: "top-5", bottom: "bottom-5", left: "left-5", right: "right-5" } as const;

const noop = () => {};

export function WidgetPreview({ config }: { config: WidgetConfig }) {
  const [open, setOpen] = useState(true);
  const panelId = useId();
  const top = config.position.startsWith("top");
  const left = config.position.endsWith("left");
  const label = config.label.trim() || DEFAULT_WIDGET_CONFIG.label;
  const header = config.header_text.trim() || DEFAULT_WIDGET_CONFIG.header_text;

  return (
    <Card as="section" aria-labelledby="widget-preview-heading" className="min-w-0 overflow-hidden">
      <div className="flex flex-col gap-1 border-b border-line px-5 py-4 sm:px-6">
        <h3 id="widget-preview-heading" className="text-base font-medium text-ink">
          Live preview
        </h3>
        <p className="text-sm text-ink-muted">Toggle the chat button to try the opening animation.</p>
      </div>
      <div className="p-4 sm:p-5">
        {/* A light "customer site": always the widget's fixed look, whatever the dashboard theme. */}
        <div
          data-testid="preview-frame"
          className="surface-widget overflow-hidden rounded-lg border border-line bg-canvas shadow-sm"
        >
          <div aria-hidden="true" className="flex items-center gap-3 border-b border-line bg-card px-3 py-2">
            <span className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-wash-strong" />
              <span className="size-2.5 rounded-full bg-wash-strong" />
              <span className="size-2.5 rounded-full bg-wash-strong" />
            </span>
            <span className="h-5 flex-1 rounded-sm bg-wash" />
          </div>
          <div className={cn("relative h-[26rem] overflow-hidden", styles.stage)}>
            <div aria-hidden="true" className="flex flex-col gap-3 p-6 sm:p-8">
              <span className="h-4 w-2/5 rounded-sm bg-wash-strong" />
              <span className="h-2.5 w-4/5 rounded-sm bg-wash" />
              <span className="h-2.5 w-3/5 rounded-sm bg-wash" />
              <span className="mt-4 h-20 w-full rounded-md bg-wash" />
            </div>
            <div
              data-testid="launcher-anchor"
              className={cn(
                "absolute flex max-w-[calc(100%-2.5rem)] gap-3",
                top ? cn(LAUNCHER_INSET.top, "flex-col") : cn(LAUNCHER_INSET.bottom, "flex-col-reverse"),
                left ? cn(LAUNCHER_INSET.left, "items-start") : cn(LAUNCHER_INSET.right, "items-end"),
              )}
            >
              <button
                type="button"
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                className="ph-no-capture min-h-12 max-w-full rounded-full px-5 py-2 text-sm font-semibold wrap-anywhere text-white shadow-glass-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
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
                    "h-80 w-72 max-w-full overflow-hidden rounded-lg border border-line shadow-glass-lg",
                    styles.panel,
                  )}
                  style={{ transformOrigin: config.position.replace("-", " ") }}
                >
                  {/* The real widget panel (components/embed), in its preview mode. */}
                  <PanelView
                    preview
                    phase="ready"
                    headerText={header}
                    showBadge={config.show_badge}
                    messages={[]}
                    typing={false}
                    error={null}
                    draft=""
                    onDraftChange={noop}
                    onSubmit={noop}
                    onClose={() => setOpen(false)}
                    onRetry={noop}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
