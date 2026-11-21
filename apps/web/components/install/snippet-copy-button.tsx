"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { captureSnippetCopied } from "../../lib/posthog/browser";
import { Button } from "../ui/button";
import { copyText } from "./install-snippet";

type CopyStatus = "idle" | "copied" | "failed";

const LABELS: Record<CopyStatus, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Copy failed",
};

/** Copies the exact snippet and says so for 2 seconds (also to screen readers). */
export function SnippetCopyButton({ projectId, text }: { projectId: string; text: string }) {
  const clerk = useClerk();
  const [status, setStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  async function copy() {
    const ownerId = clerk.user?.id;
    const ok = await copyText(
      text,
      typeof navigator === "undefined" ? undefined : navigator.clipboard,
    );
    setStatus(ok ? "copied" : "failed");
    if (ok && ownerId) {
      void captureSnippetCopied(ownerId, projectId, () => clerk.user?.id === ownerId);
    }
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
