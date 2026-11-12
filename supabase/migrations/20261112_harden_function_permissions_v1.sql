-- Zpřísnění oprávnění databázových funkcí (aplikováno 12. 11. 2026).

-- Administrátorské funkce smí volat jen přihlášení uživatelé, ne anonymní návštěvníci.
revoke execute on function public.admin_cancel_invite(uuid) from public, anon;
revoke execute on function public.admin_invite_info(uuid) from public, anon;
revoke execute on function public.admin_list_access() from public, anon;
revoke execute on function public.admin_revoke_access(uuid) from public, anon;
revoke execute on function public.claim_admin_invite(uuid) from public, anon;
revoke execute on function public.claim_pending_admin_invite() from public, anon;
revoke execute on function public.create_admin_invite(text) from public, anon;
revoke execute on function public.pending_admin_invite() from public, anon;
revoke execute on function public.is_admin() from public, anon;

grant execute on function public.admin_cancel_invite(uuid) to authenticated;
grant execute on function public.admin_invite_info(uuid) to authenticated;
grant execute on function public.admin_list_access() to authenticated;
grant execute on function public.admin_revoke_access(uuid) to authenticated;
grant execute on function public.claim_admin_invite(uuid) to authenticated;
grant execute on function public.claim_pending_admin_invite() to authenticated;
grant execute on function public.create_admin_invite(text) to authenticated;
grant execute on function public.pending_admin_invite() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Funkce pro hráče zůstávají dostupné (hráč nemá účet), ale jen výslovně.
revoke execute on function public.reset_game_progress(uuid, uuid) from public;
grant execute on function public.reset_game_progress(uuid, uuid) to anon, authenticated;

-- Triggerové funkce nemají být volatelné přes API a mají pevný search_path.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.set_customer_updated_at() from public, anon, authenticated;
revoke execute on function public.set_email_template_updated_at() from public, anon, authenticated;
alter function public.set_updated_at() set search_path = '';
alter function public.set_customer_updated_at() set search_path = '';
alter function public.set_email_template_updated_at() set search_path = '';
