import type { ReactNode } from "react";
import { AppClerkProvider } from "@/components/auth/app-clerk-provider";

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppClerkProvider>{children}</AppClerkProvider>;
}
