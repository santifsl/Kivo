# Production launch

main `634f3bb` (redesign done, CI green). The PO does every step here; agents never deploy production or touch the prod database. Variable names come from `docs/project.md` §11.

## 1. Supabase (prod)
- [ ] Create a new Supabase project for production.
- [ ] Apply the migrations in `supabase/migrations`, oldest first (SQL editor, or `supabase link` + `supabase db push`):
  1. `20261109192142_initial_schema.sql`
  2. `20261119002218_create_project.sql`
  3. `20261119020544_chat_functions.sql`
  4. `20261120213937_knowledge.sql` (also creates the private `knowledge` storage bucket)
  5. `20261121190351_track_first_chat.sql`
  6. `20261126011827_add_account_billing_revision.sql`
- [ ] Authentication → Third-party auth → add Clerk (the **production** instance), the same as on dev.
- [ ] Storage: confirm the `knowledge` bucket exists and is private.

## 2. Clerk (production instance)
- [ ] Add your production domain.
- [ ] Billing on, with two plans. Keep the keys exactly:
  - `free`: "1 project, 100 messages a month. Free forever."
  - `pro`: $9/month, "5 projects, 2,000 messages a month per project, full widget customization."
- [ ] Webhooks → add `https://<prod-domain>/api/clerk/webhook` with the subscription events. Copy the signing secret.
- [ ] Dev instance too: fix the Free plan (slug `free_user`) description, which still reads "Free kivo".

## 3. Vercel → Settings → Environment Variables → **Production**
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (prod Supabase)
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` (prod Clerk)
- [ ] `OPENAI_API_KEY`, `ARCJET_KEY`
- [ ] `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
- [ ] `NEXT_PUBLIC_APP_URL` = the production URL
- [ ] Leave `LANDING_WIDGET_KEY` for step 5.

## 4. Promote
- [ ] Vercel → Deployments → main's latest (`634f3bb`) → Redeploy with the Production environment → Promote to Production.
- [ ] Open the prod URL. The landing page loads (no widget yet), and sign-up works.

## 5. Landing widget
- [ ] On the live site: sign up, create a project called "Kivo", and add knowledge about Kivo (paste the landing page text or a short product doc). Wait for Ready.
- [ ] Copy the project's public key (Install tab) into `LANDING_WIDGET_KEY` (Production), then redeploy.
- [ ] Reload the landing page. The chat button appears and answers a question about Kivo.

## 6. Verify

The visual audit (`node e2e/redesign-audit.ts`) runs on Previews only. It already passed on a Preview of this exact code (see `e2e/screenshots/redesign/README.md`), so don't run it on production.

**Option A (recommended): check the core flow by hand, about 10 minutes.** These are the nine steps of `docs/project.md` §2:
- [ ] 1–2. Landing: the chat button shows and answers a question about Kivo.
- [ ] 3. Sign up, create a project, upload a small PDF, and wait for Ready.
- [ ] 4–5. Paste the Install snippet into a plain HTML page on another origin. The widget appears and answers from the PDF.
- [ ] 6. Conversations shows that chat.
- [ ] 7. Customize shows the paywall.
- [ ] 8. Upgrade to Pro on Billing with a real card (refund it afterwards). Customize unlocks. This confirms the prod webhook.
- [ ] 9. Change the button color, then reload the HTML page. The new color shows.
- [ ] PostHog: the events from these steps show up.

**Option B: the automated run (`pnpm e2e:core <prod-url>`).** It needs extra setup:
- [ ] Turn on test mode in the **production** Clerk instance for the run. Sign-up uses a `+clerk_test` address and the code `424242`. Turn it off afterwards.
- [ ] Run it from a machine with Chromium (`pnpm exec playwright install chromium`) and the **prod** values of `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` in its shell. These are needed for sign-up and cleanup, so never put them in a developer's dev variables.
- [ ] Steps 8–9 are skipped on live Billing (no test card). Do steps 8–9 from Option A by hand.
