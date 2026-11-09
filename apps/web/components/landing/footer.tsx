import Link from "next/link";
import { APP_NAME } from "@kivo/shared";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "../../lib/auth/routes";

const LINK_CLASSES =
  "rounded-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none";

export function Footer({ year = new Date().getFullYear() }: { year?: number }) {
  return (
    <footer className="flex flex-col items-center justify-between gap-4 border-t border-line py-8 text-sm sm:flex-row">
      <p className="font-semibold text-ink">{APP_NAME}</p>
      <nav aria-label="Account" className="flex gap-6">
        <Link href={SIGN_IN_PATH} className={LINK_CLASSES}>
          Sign in
        </Link>
        <Link href={SIGN_UP_PATH} className={LINK_CLASSES}>
          Sign up
        </Link>
      </nav>
      <p className="text-ink-subtle">
        © {year} {APP_NAME}
      </p>
    </footer>
  );
}
