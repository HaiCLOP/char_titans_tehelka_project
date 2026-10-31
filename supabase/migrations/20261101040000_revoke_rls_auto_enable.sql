-- Migration 12: Supabase's rls_auto_enable() is an event-trigger function (it turns RLS on for new tables);
-- it never needs to be callable through the API, but the advisor showed anon/authenticated could execute it.
-- Event triggers keep firing after this revoke.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
