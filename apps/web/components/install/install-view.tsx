import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { CUSTOMIZE_TAB, projectTabHref } from "../projects/project-tabs";
import { Card } from "../ui/card";
import { SnippetCopyButton } from "./snippet-copy-button";

/** The three steps, in order (their titles; step 1 holds the code). */
export const INSTALL_STEPS = ["Copy the snippet", "Paste it before </body>", "Reload your site"] as const;

/**
 * The code card's classes. Lines wrap only at the spaces between attributes:
 * each part is a `whitespace-nowrap` span (browsers would otherwise break a URL
 * after "/" or a key at "-"), and a part that still doesn't fit scrolls sideways
 * inside the card. The card is always dark (`theme-dark`).
 */
export const SNIPPET_CODE_CLASSES =
  "overflow-x-auto px-4 py-4 font-mono text-sm leading-relaxed break-normal whitespace-pre-wrap text-ink sm:px-5";

/** The snippet split at its spaces: the only places a line may wrap. */
export function snippetParts(snippet: string): string[] {
  return snippet.split(" ");
}

/** The Install tab: three steps, the project's script tag with a copy button, and a "Test it" hint. */
export function InstallView({ projectId, snippet }: { projectId: string; snippet: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-3xl leading-display tracking-display text-ink">Install</h2>
        <p className="text-sm text-ink-muted">Add the chat widget to your website in three steps.</p>
      </div>

      <ol className="flex flex-col gap-4">
        <Step number={1} title={INSTALL_STEPS[0]} body="Your project's install code. It works on any website.">
          <section
            aria-labelledby="install-code-heading"
            className="theme-dark overflow-hidden rounded-lg border border-line bg-canvas"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line py-2 pr-2 pl-4 sm:pl-5">
              <h3 id="install-code-heading" className="font-mono text-xs text-ink-muted">
                HTML
              </h3>
              <SnippetCopyButton projectId={projectId} text={snippet} />
            </div>
            {/* Text, not HTML. */}
            <pre className={SNIPPET_CODE_CLASSES}>
              <code className="ph-no-capture" data-testid="install-snippet">
                {snippetParts(snippet).map((part, i) => (
                  <Fragment key={i}>
                    {i > 0 ? " " : null}
                    <span className="whitespace-nowrap">{part}</span>
                  </Fragment>
                ))}
              </code>
            </pre>
          </section>
        </Step>
        <Step
          number={2}
          title={INSTALL_STEPS[1]}
          body={
            <>
              Put it just before the closing <code className="rounded-sm bg-wash px-1 font-mono text-xs text-ink">&lt;/body&gt;</code>{" "}
              tag, on every page where the chat should show. Site builders call this &ldquo;custom code&rdquo; or a
              footer script.
            </>
          }
        />
        <Step
          number={3}
          title={INSTALL_STEPS[2]}
          body="Reload a page of your site. The chat button appears in the corner."
        />
      </ol>

      <Card as="aside" aria-label="Test it" className="flex flex-col gap-1 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="text-sm text-ink-muted">
          <span className="font-medium text-ink">Test it.</span> See the widget with your colors and text before it
          goes live.
        </p>
        <Link
          href={projectTabHref(projectId, CUSTOMIZE_TAB)}
          className="inline-flex w-fit shrink-0 items-center gap-1 text-sm font-medium text-ink underline decoration-brand underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Open the widget preview
          <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </Link>
      </Card>
    </div>
  );
}

function Step({
  number,
  title,
  body,
  children,
}: {
  number: number;
  title: string;
  body: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li>
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong text-sm font-medium text-ink"
          >
            {number}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
            <h3 className="text-sm font-medium text-ink">
              <span className="sr-only">Step {number}: </span>
              {title}
            </h3>
            <p className="text-sm text-ink-muted">{body}</p>
          </div>
        </div>
        {children}
      </Card>
    </li>
  );
}
