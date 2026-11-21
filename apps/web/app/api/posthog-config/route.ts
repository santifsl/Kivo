import { readPosthogConfig } from "../../../lib/posthog/config";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const config = readPosthogConfig();
  const headers = { "Cache-Control": "no-store" };

  return config ? Response.json(config, { headers }) : new Response(null, { status: 204, headers });
}
