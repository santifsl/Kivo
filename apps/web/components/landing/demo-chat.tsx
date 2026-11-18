import { APP_NAME } from "@kivo/shared";
import { GlassPanel } from "../ui/glass-panel";
import { Reveal } from "./reveal";
import { Section } from "./section";

export const DEMO_QUESTION = "Can I use it on a Shopify store?";
export const DEMO_ANSWER = `Yes. ${APP_NAME} works on any site where you can add a script tag, Shopify included. Paste the snippet into your theme's layout, and the chat button shows on every page.`;

// TODO(Phase 6): replace this static mock with the real widget, running the app's own project
// (docs/project.md §6.1, LANDING_WIDGET_KEY).
/** Static, non-interactive picture of the chat panel. Messages render as plain text. */
export function DemoChat() {
  return (
    <Section
      id="demo"
      eyebrow="Live demo"
      title="See it answer"
      description="This is what your visitors see when they open the chat."
    >
      <Reveal className="mx-auto w-full max-w-md">
        <GlassPanel
          as="section"
          aria-label={`${APP_NAME} chat preview`}
          className="flex flex-col overflow-hidden"
        >
          <header className="flex items-center gap-3 border-b border-line px-5 py-4">
            <span aria-hidden="true" className="size-2.5 rounded-sm bg-ink" />
            <p className="font-semibold text-ink">How can we help?</p>
          </header>
          <ol className="flex flex-col gap-3 px-5 py-6">
            <li className="max-w-[85%] self-end rounded-lg bg-accent px-4 py-2.5 text-sm text-accent-ink">
              <span className="sr-only">Visitor: </span>
              {DEMO_QUESTION}
            </li>
            <li className="max-w-[85%] self-start rounded-lg border border-line bg-wash px-4 py-2.5 text-sm text-ink">
              <span className="sr-only">{APP_NAME}: </span>
              {DEMO_ANSWER}
            </li>
          </ol>
          <div aria-hidden="true" className="flex items-center gap-2 border-t border-line px-5 py-4">
            <div className="h-10 flex-1 rounded-md border border-line bg-wash px-3 text-sm leading-10 text-ink-subtle">
              Ask a question…
            </div>
            <div className="flex h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-ink">
              Send
            </div>
          </div>
          <p className="pb-3 text-center text-xs text-ink-subtle">Powered by {APP_NAME}</p>
        </GlassPanel>
      </Reveal>
    </Section>
  );
}
