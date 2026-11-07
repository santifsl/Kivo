import { clerkMiddleware } from "@clerk/nextjs/server";
import { unauthorizedResponse } from "./lib/auth/errors";
import { classifyRoute, SIGN_IN_PATH, SIGN_UP_PATH } from "./lib/auth/routes";

// First line of defence. Clerk recommends each page and route handler also checks auth itself
// (see app/dashboard/page.tsx); owner route handlers must call auth() too.
export default clerkMiddleware(
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

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
