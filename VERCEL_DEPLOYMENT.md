# Deploy Abi-Chris to Vercel

Vercel is the selected hosting provider. The deployment has not started: this computer has no Vercel CLI or linked Vercel project, and downloading the CLI failed because the npm registry connection reset. The steps below let the owner sign in without sharing account credentials or secrets in chat.

## Create a preview deployment

1. On the Windows computer, open PowerShell in this project folder:

   `C:\Users\amadu\Desktop\abi-fashion-images\abi-chris-fashion-store-first-build`

2. Install the Vercel command-line tool. Use `npm.cmd` to avoid the PowerShell script-policy error previously seen with `npm`:

   `npm.cmd install --global vercel`

3. Sign in to the owner's Vercel account:

   `vercel login`

   Complete the sign-in in the browser. Do not send a password or access token in chat.

4. Back in PowerShell, run `vercel link`. Choose the owner's account/team and create a new project for this folder (or select the existing Abi-Chris project).

5. In Vercel, open **Project Settings → Environment Variables** and add these three variables for **Preview** and **Production** using the values already in the private local `.env.local` file:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_STORE_WHATSAPP_NUMBER`

   Never add a Supabase service-role key to this website.

6. From the project folder, run:

   `vercel`

   This creates a preview deployment. Keep the preview address private while testing.

## Acceptance checks before production

- [ ] Apply and verify the prepared SQL upgrades in the **new** Supabase project; run `supabase/security-checks.sql` and review every result.
- [ ] In Supabase Authentication URL Configuration, add the Vercel preview/production URLs as allowed redirect URLs; set the final site URL after the production domain is chosen.
- [ ] Sign in as owner, administrator, salesperson, approved and unapproved wholesale customers, and two separate delivery accounts. Confirm each role sees only its allowed information.
- [ ] Test a sample product and stock change on both laptop and phone; test a POS sale and online order against the same stock. Use test records only.
- [ ] Verify order totals, reports, exports, audit history, photos, backup access, and a recovery drill plan.
- [ ] Only after these checks pass, deploy production with `vercel --prod`.

Vercel's documented local-project workflow is to link/deploy through its CLI and use preview deployments for testing before production. See [Deploying a project from the CLI](https://vercel.com/docs/projects/deploy-from-cli) and [Vercel environments](https://vercel.com/docs/deployments/environments).
