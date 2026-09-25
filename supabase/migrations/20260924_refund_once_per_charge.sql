-- One refund per charge, decided in one place.
--
-- Before: the refund trigger only fired on status → 'failed', while Railway and
-- several edge functions also called increment_credit by hand. Some failures were
-- refunded twice (pipeline crash → manual refund, then the sweeper flipped the
-- stuck row to 'failed' → trigger refund), some never (render recovery after a
-- Railway restart → remotion_error), and a user who reset a finished row's status
-- could re-run the free render step and collect repeat refunds.
--
-- Now: every charge stamps credit_charged_at on the generation (edge functions,
-- together with the in-flight status claim). The trigger refunds when a stamped
-- row enters a terminal failure status and clears the stamp in the same write;
-- success ('complete') also clears it. Pipelines never refund by hand — they only
-- set a failure status.

alter table public.ai_generations add column if not exists credit_charged_at timestamptz;
comment on column public.ai_generations.credit_charged_at is
  'Set when a credit is charged for this generation; cleared on refund or completion. Server-only.';

create or replace function public.refund_credit_on_failure()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
begin
  -- Only server-side status changes (pipeline, sweeper, edge functions) count.
  if coalesce(auth.role(), 'service_role') <> 'service_role' then
    return new;
  end if;

  if new.status = 'complete' then
    new.credit_charged_at := null;
    return new;
  end if;

  if new.credit_charged_at is not null
     and new.status in ('failed', 'scene_desc_error', 'voiceover_error', 'remotion_error', 'all_clips_failed', 'kling_all_failed')
     and old.status is distinct from new.status then
    select p.user_id into v_user_id from projects p where p.id = new.project_id;
    if v_user_id is not null then
      update user_profiles set credits_remaining = credits_remaining + 1 where id = v_user_id;
    end if;
    new.credit_charged_at := null;
  end if;
  return new;
end;
$function$;

-- BEFORE so the function can clear credit_charged_at in the same write.
drop trigger if exists trg_refund_credit_on_failure on public.ai_generations;
create trigger trg_refund_credit_on_failure
  before update of status on public.ai_generations
  for each row execute function public.refund_credit_on_failure();

revoke execute on function public.refund_credit_on_failure() from public, anon, authenticated;

-- Backfill: generations charged before this change that are still in flight.
update public.ai_generations g
   set credit_charged_at = now()
  from public.projects p
  left join public.user_profiles up on up.id = p.user_id
 where p.id = g.project_id
   and not coalesce(up.is_admin, false)
   and g.status in ('generating_videos', 'ai_tasks_created', 'ai_tasks_done', 'generating_broll',
                    'videos_ready', 'clips_ready', 'render_queued', 'remotion_rendering');
