"use client";

import { useClerk } from "@clerk/nextjs";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { captureSnippetCopied } from "../../lib/posthog/browser";
import { Button } from "../ui/button";
import { type CopyStatus, createCopyFeedback } from "./copy-feedback";
import { copyText } from "./install-snippet";

const LABELS: Record<CopyStatus, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Copy failed",
};

/** Copies the exact snippet and says so for 2 seconds (also to screen readers), then resets. */
export function SnippetCopyButton({ projectId, text }: { projectId: string; text: string }) {
  const clerk = useClerk();
  const [status, setStatus] = useState<CopyStatus>("idle");
  // One timer per mount, made in the effect so StrictMode's mount/unmount/mount
  // gets a live one, and disposed on unmount so a late copy can't touch it.
  const feedback = useRef<ReturnType<typeof createCopyFeedback>>(null);
  useEffect(() => {
    const current = createCopyFeedback(setStatus);
    feedback.current = current;
    return () => {
      current.dispose();
      feedback.current = null;
    };
  }, []);

  async function copy() {
    const ownerId = clerk.user?.id;
    const ok = await copyText(
      text,
      typeof navigator === "undefined" ? undefined : navigator.clipboard,
    );
    feedback.current?.show(ok ? "copied" : "failed");
    if (ok && ownerId) {
      void captureSnippetCopied(ownerId, projectId, () => clerk.user?.id === ownerId);
    }
  }

  const Icon = status === "copied" ? Check : Copy;
  return (
    <Button variant="secondary" onClick={copy} aria-label="Copy install code" data-status={status}>
      <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
      <span aria-live="polite">{LABELS[status]}</span>
    </Button>
  );
}
