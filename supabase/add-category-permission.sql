-- Run once in the NEW Supabase project's SQL Editor to allow authenticated
-- owners and admins to create categories from the admin dashboard.
grant insert (name, slug) on public.categories to authenticated;
