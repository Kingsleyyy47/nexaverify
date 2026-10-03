-- Validate cron credentials without returning Vault secret values to callers.
-- Apply before deploying the asynchronous cron-auth handler.
begin;
create or replace function public.is_valid_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select length(p_secret) between 32 and 256 and exists (
    select 1 from vault.decrypted_secrets
     where name = 'nexaverify_cron_secret'
       and length(decrypted_secret) >= 32
       and decrypted_secret = p_secret
  );
$$;
revoke all on function public.is_valid_cron_secret(text) from public, anon, authenticated;
grant execute on function public.is_valid_cron_secret(text) to service_role;
notify pgrst, 'reload schema';
commit;
