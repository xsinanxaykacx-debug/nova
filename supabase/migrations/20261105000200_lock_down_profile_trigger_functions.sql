-- Trigger-only functions must not be callable through the public PostgREST RPC surface.
-- PostgreSQL triggers continue to invoke these functions after EXECUTE is revoked from API roles.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_profile_updated_at() from public, anon, authenticated;
