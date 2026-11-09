import type { ReactNode } from "react";
import { Reveal } from "./reveal";

export type SectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
};

/** A landing section: a revealed heading block, then the content. */
export function Section({ id, eyebrow, title, description, children }: SectionProps) {
  const headingId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={headingId} className="flex scroll-mt-8 flex-col gap-10">
      <Reveal className="flex max-w-2xl flex-col gap-3">
        <p className="text-xs font-medium tracking-widest text-ink-subtle uppercase">{eyebrow}</p>
        <h2 id={headingId} className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {title}
        </h2>
        {description ? <p className="text-base text-ink-muted">{description}</p> : null}
      </Reveal>
      {children}
    </section>
  );
}
