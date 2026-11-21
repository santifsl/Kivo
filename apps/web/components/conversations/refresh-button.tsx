"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "../ui/button";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      Refresh
    </Button>
  );
}
