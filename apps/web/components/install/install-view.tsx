import { GlassPanel } from "../ui/glass-panel";
import { SnippetCopyButton } from "./snippet-copy-button";

export const INSTALL_STEPS: readonly string[] = [
  "Copy the code.",
  "Paste it before </body> on every page.",
  "Reload the page; the chat button appears in the corner.",
];

/** The Install tab: the project's script tag, a copy button and the steps. */
export function InstallView({ projectId, snippet }: { projectId: string; snippet: string }) {
  return (
    <div className="flex flex-col gap-6">
      <GlassPanel
        as="section"
        aria-labelledby="install-code-heading"
        className="flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
          <h2 id="install-code-heading" className="text-sm font-medium text-ink">
            Install code
          </h2>
          <SnippetCopyButton projectId={projectId} text={snippet} />
        </div>
        {/* Text, not HTML. Wraps instead of scrolling sideways, so the whole tag is readable at 375 px. */}
        <pre className="p-4 font-mono text-sm leading-relaxed break-all whitespace-pre-wrap text-ink">
          <code className="ph-no-capture" data-testid="install-snippet">
            {snippet}
          </code>
        </pre>
      </GlassPanel>

      <GlassPanel
        as="section"
        aria-labelledby="install-steps-heading"
        className="flex flex-col gap-3 p-4 sm:p-6"
      >
        <h2 id="install-steps-heading" className="text-sm font-medium text-ink">
          Steps
        </h2>
        <ol className="flex flex-col gap-3">
          {INSTALL_STEPS.map((step, i) => (
            <li key={step} className="flex gap-3 text-sm text-ink-muted">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-wash text-xs font-medium text-ink"
              >
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </GlassPanel>
    </div>
  );
}
