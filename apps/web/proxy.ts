import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { unauthorizedResponse } from "./lib/auth/errors";
import { stripUntrustedClerkRedirect } from "./lib/auth/redirects";
import { classifyRoute, SIGN_IN_PATH, SIGN_UP_PATH } from "./lib/auth/routes";

// First line of defence. Clerk recommends each page and route handler also checks auth itself
// (see app/dashboard/page.tsx); owner route handlers must call auth() too.
//
// Public vs protected (lists live in lib/auth/routes.ts):
// - "public": landing, sign-in/up, the embeddable widget (/embed, /api/widget), Clerk and
//   PostHog endpoints. Site visitors are anonymous, so these must never require a session.
// - "page" (/dashboard): signed-out visitors are redirected to sign-in.
// - "owner-api" (/api/projects, /api/knowledge, /api/conversations): signed-out callers get a
//   401 JSON error, not a redirect, so API clients see a clean error instead of an HTML page.
const clerk = clerkMiddleware(
  async (auth, req) => {
    const access = classifyRoute(req.nextUrl.pathname);
    if (access === "public") return;

    const { isAuthenticated, redirectToSignIn } = await auth();
    if (isAuthenticated) return;

    if (access === "owner-api") return unauthorizedResponse();
    return redirectToSignIn({ returnBackUrl: req.url });
  },
  { signInUrl: SIGN_IN_PATH, signUpUrl: SIGN_UP_PATH },
);

// Runs before Clerk: on development instances (previews) Clerk would otherwise follow an
// off-site `__clerk_redirect_url` and attach the dev-browser token. See lib/auth/redirects.ts.
export default function proxy(req: NextRequest, event: NextFetchEvent) {
  const cleaned = stripUntrustedClerkRedirect(new URL(req.url));
  if (cleaned) return NextResponse.redirect(cleaned, 307);
  return clerk(req, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
