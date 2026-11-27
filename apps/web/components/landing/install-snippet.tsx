import { Card } from "../ui/card";
import { CopyButton } from "./copy-button";
import { buildInstallSnippet } from "./install-snippet-data";
import { Reveal } from "./reveal";
import { Section } from "./section";

export function InstallSnippet({ snippet = buildInstallSnippet() }: { snippet?: string }) {
  return (
    <Section
      id="install"
      eyebrow="Install"
      title="Install in"
      accent="one line."
      description="Paste it before the closing </body> tag. Your own project key comes from the dashboard."
    >
      <Reveal>
        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <span className="flex items-center gap-2 text-xs text-ink-subtle">
              <span aria-hidden="true" className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-wash-strong" />
                <span className="size-2.5 rounded-full bg-wash-strong" />
                <span className="size-2.5 rounded-full bg-wash-strong" />
              </span>
              index.html
            </span>
            <CopyButton text={snippet} />
          </div>
          {/* Wraps instead of scrolling sideways, so the whole tag is readable at 375 px. */}
          <pre className="p-5 font-mono text-sm leading-relaxed break-all whitespace-pre-wrap text-ink sm:p-6">
            <code data-testid="install-snippet">{snippet}</code>
          </pre>
        </Card>
      </Reveal>
    </Section>
  );
}
