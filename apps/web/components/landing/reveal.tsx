"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../ui/cn";
import styles from "./landing.module.css";

export type RevealProps = {
  children: ReactNode;
  /** Stagger, in ms, so items in a row arrive one after another. */
  delay?: number;
  className?: string;
};

type RevealState = "shown" | "hidden";

/**
 * A subtle fade-and-lift the first time content scrolls into view.
 *
 * Visible at rest: the server renders it shown, so without JavaScript, before hydration, in
 * print or in a screenshot it is simply there. After hydration, only content that is still
 * below the fold is hidden, and it comes back as soon as it scrolls into view. Content already
 * on screen never hides. Under reduced motion nothing hides or moves.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RevealState>("shown");

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    setState("hidden");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-reveal={state}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(styles.reveal, className)}
    >
      {children}
    </div>
  );
}

/** A one-time entrance for above-the-fold content, in CSS only. Ends in the normal state. */
export function Enter({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(styles.enter, className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
