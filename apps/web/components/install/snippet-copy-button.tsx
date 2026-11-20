"use client";

import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { copyText } from "./install-snippet";

type CopyStatus = "idle" | "copied" | "failed";

const LABELS: Record<CopyStatus, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Copy failed",
};

/** Copies the exact snippet and says so for 2 seconds (also to screen readers). */
export function SnippetCopyButton({ text }: { text: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  async function copy() {
    const ok = await copyText(
      text,
      typeof navigator === "undefined" ? undefined : navigator.clipboard,
    );
    setStatus(ok ? "copied" : "failed");
  }

  return (
    <Button
      variant="secondary"
      onClick={copy}
      aria-label="Copy install code"
      className="h-8 px-3 text-xs"
    >
      <span aria-live="polite">{LABELS[status]}</span>
    </Button>
  );
}
