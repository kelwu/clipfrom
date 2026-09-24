-- Stores the AI edit plan for talking-head renders (b-roll moments with layout,
-- search query, reason, clip URL and timing, plus emphasis/zoom word indices).
-- Written by the Railway pipeline with the service role; basis for a future editor.
alter table public.ai_generations add column if not exists broll_plan jsonb;
comment on column public.ai_generations.broll_plan is 'AI edit plan for talking-head renders: model, b-roll moments (layout, query, reason, clip, timing) and emphasis word indices. Server-written; basis for a future b-roll editor.';
