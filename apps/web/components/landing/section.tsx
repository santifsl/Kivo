import type { ReactNode } from "react";
import { cn } from "../ui/cn";
import { Eyebrow } from "../ui/eyebrow";
import { Reveal } from "./reveal";

export type SectionProps = {
  id: string;
  eyebrow: string;
  /** The serif headline. `accent` is appended in terracotta italic. */
  title: string;
  accent?: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** A landing section: eyebrow, serif headline (optional italic terracotta phrase), content. */
export function Section({
  id,
  eyebrow,
  title,
  accent,
  description,
  children,
  className,
}: SectionProps) {
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("relative isolate flex scroll-mt-24 flex-col gap-12", className)}
    >
      <Reveal className="flex max-w-2xl flex-col gap-4">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2
          id={headingId}
          className="font-display text-4xl leading-display tracking-display text-ink sm:text-5xl"
        >
          {title}
          {accent ? (
            <>
              {" "}
              <em className="text-brand">{accent}</em>
            </>
          ) : null}
        </h2>
        {description ? <p className="text-base text-ink-muted sm:text-lg">{description}</p> : null}
      </Reveal>
      {children}
    </section>
  );
}
