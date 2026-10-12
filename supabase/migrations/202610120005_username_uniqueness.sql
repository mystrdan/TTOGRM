-- Keep username uniqueness consistent with the API: one case-insensitive username per Telegram account,
-- regardless of whether the record is categorized as a personal profile, group, or channel.
-- Preflight confirmed there are no existing duplicate account/username pairs.
drop index if exists public.username_entries_owner_username_entity_uidx;
create unique index if not exists username_entries_owner_username_uidx
  on public.username_entries (telegram_user_id, lower(username));
