import { publicKeySchema } from "@kivo/shared";
import { EMBED_QUERY } from "@kivo/shared/embed";
import type { Metadata } from "next";
import { EmbedApp } from "@/components/embed/embed-app";
import { parseHostOrigin } from "@/lib/embed/origin";

export const metadata: Metadata = { robots: { index: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * /embed?key=pk_…&origin=https://host.example: the chat panel inside the
 * widget's iframe. Must stay frameable by any site (no frame-ancestors here).
 */
export default async function EmbedPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const key = publicKeySchema.safeParse(first(params[EMBED_QUERY.key]));
  const publicKey = key.success ? key.data : null;
  const hostOrigin = parseHostOrigin(first(params[EMBED_QUERY.origin]));
  return <EmbedApp key={publicKey} publicKey={publicKey} hostOrigin={hostOrigin} />;
}
