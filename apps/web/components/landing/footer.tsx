import Link from "next/link";
import { APP_NAME } from "@kivo/shared";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "../../lib/auth/routes";
import { KivoLogo } from "../brand/logo";

const LINK_CLASSES =
  "rounded-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none";

export const FOOTER_TAGLINE = "AI support that answers from your docs.";

export function Footer({
  year = new Date().getFullYear(),
  hasDemo = false,
}: {
  year?: number;
  hasDemo?: boolean;
}) {
  const product = [
    { href: "#how-it-works", label: "How it works" },
    ...(hasDemo ? [{ href: "#demo", label: "Live demo" }] : []),
    { href: "#pricing", label: "Pricing" },
    { href: "#install", label: "Install" },
  ];
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto_auto] md:gap-16">
        <div className="flex flex-col gap-3">
          <KivoLogo tone="paper" size={26} />
          <p className="max-w-xs text-sm text-ink-muted">{FOOTER_TAGLINE}</p>
        </div>
        <nav aria-label="Product" className="flex flex-col gap-3 text-sm">
          <p className="text-xs font-medium tracking-eyebrow text-ink-subtle uppercase">Product</p>
          {product.map((link) => (
            <a key={link.href} href={link.href} className={LINK_CLASSES}>
              {link.label}
            </a>
          ))}
        </nav>
        <nav aria-label="Account" className="flex flex-col gap-3 text-sm">
          <p className="text-xs font-medium tracking-eyebrow text-ink-subtle uppercase">Account</p>
          <Link href={SIGN_IN_PATH} className={LINK_CLASSES}>
            Log in
          </Link>
          <Link href={SIGN_UP_PATH} className={LINK_CLASSES}>
            Sign up
          </Link>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-ink-subtle sm:px-6">
          © {year} {APP_NAME}
        </p>
      </div>
    </footer>
  );
}
