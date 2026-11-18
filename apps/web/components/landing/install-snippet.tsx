import { GlassPanel } from "../ui/glass-panel";
import { CopyButton } from "./copy-button";
import { buildInstallSnippet } from "./install-snippet-data";
import { Reveal } from "./reveal";
import { Section } from "./section";

export function InstallSnippet({ snippet = buildInstallSnippet() }: { snippet?: string }) {
  return (
    <Section
      id="install"
      eyebrow="Install"
      title="One line of code"
      description="Paste it before the closing </body> tag. Your own project key comes from the dashboard."
    >
      <Reveal>
        <GlassPanel className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
            <span className="text-xs text-ink-subtle">HTML</span>
            <CopyButton text={snippet} />
          </div>
          {/* Wraps instead of scrolling sideways, so the whole tag is readable at 375 px. */}
          <pre className="p-4 text-sm leading-relaxed break-all whitespace-pre-wrap text-ink">
            <code data-testid="install-snippet">{snippet}</code>
          </pre>
        </GlassPanel>
      </Reveal>
    </Section>
  );
}
