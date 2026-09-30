-- Per-user defaults for new videos (caption style, b-roll layout, filler removal, article preset).
-- Plain UI preferences: the owner may read and write them; nothing billing-related.
alter table public.user_profiles add column if not exists preferences jsonb not null default '{}'::jsonb;
comment on column public.user_profiles.preferences is 'UI defaults for new videos: captionStyle, brollLayout, removeFillers, articlePreset.';
grant update (preferences) on public.user_profiles to authenticated;
