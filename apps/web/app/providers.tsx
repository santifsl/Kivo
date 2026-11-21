"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import { getPosthogBrowser, updatePosthogReplay } from "../lib/posthog/browser";

export function PosthogRouteObserver() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (!pathname) return;
    updatePosthogReplay(pathname);
    void getPosthogBrowser();
  }, [pathname]);

  return null;
}
