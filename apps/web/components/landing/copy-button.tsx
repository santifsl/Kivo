"use client";

import { useEffect, useState } from "react";
import { Button } from "../ui/button";

type CopyStatus = "idle" | "copied" | "failed";

const LABELS: Record<CopyStatus, string> = { idle: "Copy", copied: "Copied", failed: "Copy failed" };

/** Copies `text` to the clipboard and says so for 2 seconds (also to screen readers). */
export function CopyButton({ text, label = "Copy snippet" }: { text: string; label?: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <Button variant="secondary" onClick={copy} aria-label={label} className="h-8 px-3 text-xs">
      <span aria-live="polite">{LABELS[status]}</span>
    </Button>
  );
}
