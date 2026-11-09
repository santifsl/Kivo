"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../ui/cn";

export type RevealProps = {
  children: ReactNode;
  /** Stagger, in ms, so items in a row arrive one after another. */
  delay?: number;
  className?: string;
};

/**
 * Fades and lifts its children in the first time they scroll into view (on load for the hero).
 * IntersectionObserver + a CSS transition, no library. With reduced motion, the content is simply
 * visible: no transition, no offset. Without JavaScript, the <noscript> rule in RevealFallback
 * keeps everything visible.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-reveal=""
      data-visible={visible}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        "translate-y-4 opacity-0 transition-[opacity,translate] duration-700 ease-out",
        "data-[visible=true]:translate-y-0 data-[visible=true]:opacity-100",
        "motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Keeps Reveal content visible when JavaScript is off. Render once per page. */
export function RevealFallback() {
  return (
    <noscript>
      <style>{"[data-reveal]{opacity:1 !important;translate:none !important}"}</style>
    </noscript>
  );
}
