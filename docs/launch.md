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
- [ ] Send the prod URL to Michael. Jim runs `pnpm e2e:core <prod-url>` and `node e2e/redesign-audit.ts <prod-url>`.
- [ ] Steps 8–9 (upgrade to Pro, new button color) are skipped on live Clerk. Do one real upgrade by hand: Billing → Pro → Customize unlocks → change the color → the widget shows it on reload. This confirms the webhook.
- [ ] PostHog: the events from the test show up.
