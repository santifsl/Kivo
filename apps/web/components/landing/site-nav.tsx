"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "../../lib/auth/routes";
import { KivoLogo } from "../brand/logo";
import { cn } from "../ui/cn";
import styles from "./landing.module.css";
import { LinkButton } from "./link-button";

/** In-page anchors only: every link goes to a section on this page. */
export const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
] as const;

const TEXT_LINK =
  "rounded-sm text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none";

/**
 * Sticky top bar. Transparent over the hero; once the page scrolls it gets the canvas color,
 * a hairline and a blur. Under 768px the links move into a sheet behind a menu button.
 */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const sheetId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    // The sheet is a mobile layout: close it if the window grows past the breakpoint.
    const wide = window.matchMedia?.("(min-width: 768px)");
    const onWide = () => wide?.matches && setOpen(false);
    document.addEventListener("keydown", onKey);
    wide?.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      wide?.removeEventListener("change", onWide);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header
      data-scrolled={scrolled || open}
      className={cn(styles.nav, "sticky top-0 z-40 border-b border-transparent")}
    >
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6"
      >
        <Link
          href="/"
          className="rounded-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >
          <KivoLogo tone="paper" size={26} />
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href} className={TEXT_LINK}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 md:flex">
          <LinkButton href={SIGN_IN_PATH} variant="secondary">
            Log in
          </LinkButton>
          <LinkButton href={SIGN_UP_PATH} arrow>
            Get started
          </LinkButton>
        </div>

        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={sheetId}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
          className="flex size-10 items-center justify-center rounded-full border border-line-strong text-ink hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:hidden"
        >
          {open ? (
            <X aria-hidden="true" className="size-5" strokeWidth={1.75} />
          ) : (
            <Menu aria-hidden="true" className="size-5" strokeWidth={1.75} />
          )}
        </button>
      </nav>

      <div
        id={sheetId}
        hidden={!open}
        data-testid="nav-sheet"
        className="border-t border-line bg-canvas px-4 pt-2 pb-6 md:hidden"
      >
        <ul className="flex flex-col">
          {NAV_LINKS.map((link) => (
            <li key={link.href} className="border-b border-line">
              <a
                href={link.href}
                onClick={close}
                className="flex h-12 items-center text-base text-ink focus-visible:outline-2 focus-visible:outline-brand"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col gap-3">
          <LinkButton href={SIGN_IN_PATH} variant="secondary" size="lg" onClick={close}>
            Log in
          </LinkButton>
          <LinkButton href={SIGN_UP_PATH} size="lg" arrow onClick={close}>
            Get started
          </LinkButton>
        </div>
      </div>
    </header>
  );
}
