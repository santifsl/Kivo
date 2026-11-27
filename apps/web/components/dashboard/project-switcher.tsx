"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { Plan } from "@kivo/shared";
import { projectHref } from "../projects/project-tabs";
import { cn } from "../ui/cn";
import { PROJECTS_HREF, type SwitcherProject } from "./nav";

const PLAN_LABELS: Record<Plan, string> = { free: "Free plan", pro: "Pro plan" };

export type ProjectSwitcherViewProps = {
  /** The project being viewed, or null outside a project. */
  current: SwitcherProject | null;
  /** The owner's projects (owner client, RLS-scoped). */
  projects: readonly SwitcherProject[];
  plan: Plan | null;
  open: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  menuId: string;
};

/** The switcher card and its menu, drawn from props (testable without a browser). */
export function ProjectSwitcherView({
  current,
  projects,
  plan,
  open,
  onToggle,
  onNavigate,
  menuId,
}: ProjectSwitcherViewProps) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={onToggle}
        data-testid="project-switcher"
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border border-line bg-card px-3 py-2.5 text-left shadow-card transition-colors",
          "hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-ink">{current?.name ?? "All projects"}</span>
          {plan ? <span className="text-xs text-ink-muted">{PLAN_LABELS[plan]}</span> : null}
        </span>
        <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          aria-label="Switch project"
          className="absolute inset-x-0 bottom-full z-20 mb-2 flex max-h-72 flex-col gap-0.5 overflow-y-auto rounded-lg border border-line bg-glass-strong p-1 shadow-glass-lg"
        >
          {projects.map((project) => {
            const selected = project.id === current?.id;
            return (
              <li key={project.id} role="none">
                <Link
                  role="menuitem"
                  href={projectHref(project.id)}
                  aria-current={selected ? "page" : undefined}
                  onClick={onNavigate}
                  className="flex h-9 items-center gap-2 rounded-md px-2.5 text-sm text-ink hover:bg-wash focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  {selected ? <Check aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} /> : null}
                </Link>
              </li>
            );
          })}
          <li role="separator" className="my-1 h-px bg-line" />
          <li role="none">
            <Link
              role="menuitem"
              href={PROJECTS_HREF}
              onClick={onNavigate}
              className="flex h-9 items-center rounded-md px-2.5 text-sm text-ink-muted hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
            >
              All projects
            </Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

/** The switcher with its open state. Closes on Escape, an outside click, or navigation. */
export function ProjectSwitcher(props: {
  current: SwitcherProject | null;
  projects: readonly SwitcherProject[];
  plan: Plan | null;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root}>
      <ProjectSwitcherView
        {...props}
        open={open}
        menuId={menuId}
        onToggle={() => setOpen((value) => !value)}
        onNavigate={() => {
          setOpen(false);
          props.onNavigate?.();
        }}
      />
    </div>
  );
}
