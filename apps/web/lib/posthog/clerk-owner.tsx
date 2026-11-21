"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { syncPosthogOwner } from "./browser";

export function PosthogClerkOwner() {
  const { isLoaded, userId } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    let isCurrent = true;
    void syncPosthogOwner(userId ?? null, () => isCurrent);
    return () => {
      isCurrent = false;
    };
  }, [isLoaded, userId]);

  return null;
}
