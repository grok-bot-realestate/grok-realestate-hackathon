-- Service role can read named vault secrets when the Edge Function env secret is unset.
-- Anon and authenticated cannot execute this.

create or replace function public.line_runtime_secret(secret_name text)
returns text
language sql
security definer
set search_path = vault, public
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = secret_name
  limit 1;
$$;

revoke all on function public.line_runtime_secret(text) from public, anon, authenticated;
grant execute on function public.line_runtime_secret(text) to service_role;
