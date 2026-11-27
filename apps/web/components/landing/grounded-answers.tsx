import { cn } from "../ui/cn";
import { Eyebrow } from "../ui/eyebrow";
import styles from "./landing.module.css";
import { Reveal } from "./reveal";

/** Line widths for the fake text on each page of the illustration. */
const LINES = ["w-11/12", "w-10/12", "w-full", "w-8/12", "w-10/12", "w-9/12"] as const;

function Page({ className, highlight = false }: { className?: string; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col gap-2.5 rounded-md border border-line bg-card p-5 shadow-glass",
        className,
      )}
    >
      <span className="mb-2 h-2 w-1/2 rounded-full bg-wash-strong" />
      {LINES.map((width, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 rounded-full",
            width,
            highlight && (index === 2 || index === 3) ? "bg-ink-muted" : "bg-wash-strong",
          )}
        />
      ))}
      {highlight ? (
        // The thin terracotta line marks the passage an answer comes from.
        <span
          data-testid="highlight-line"
          className="absolute top-[4.85rem] left-3 h-6 w-px bg-brand"
        />
      ) : null}
    </div>
  );
}

/** Stacked documents, drawn in code. Decorative. */
function DocStack() {
  return (
    <div aria-hidden="true" className="relative mx-auto aspect-[4/5] w-48 sm:w-56">
      <Page className={cn(styles.docBack, "opacity-50")} />
      <Page className={cn(styles.docMid, "opacity-75")} />
      <Page highlight />
    </div>
  );
}

export function GroundedAnswers() {
  return (
    <section id="grounded" aria-labelledby="grounded-title" className="relative scroll-mt-24">
      <Reveal>
        <div className="relative isolate grid items-center gap-12 overflow-hidden rounded-xl border border-line bg-glass p-8 shadow-glass backdrop-blur-glass sm:p-12 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div
            aria-hidden="true"
            className={cn(styles.glowNeutral, "absolute -top-1/2 -right-1/4 -z-10 size-[42rem]")}
          />
          <div className="flex flex-col gap-5">
            <Eyebrow>From docs to answers</Eyebrow>
            <h2
              id="grounded-title"
              className="font-display text-4xl leading-display tracking-display text-ink sm:text-5xl"
            >
              Answers grounded in your documents.
            </h2>
            <p className="max-w-lg text-base leading-relaxed text-ink-muted">
              For each question, Kivo finds the passages in your knowledge that match and answers
              from them alone. If your docs don&apos;t cover it, it says it doesn&apos;t know and
              points the visitor to your team, instead of making something up.
            </p>
          </div>
          <DocStack />
        </div>
      </Reveal>
    </section>
  );
}
