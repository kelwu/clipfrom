-- Security lockdown (2026-09-23). Applied to production as two migrations
-- (security_lockdown, storage_lockdown). Verified by impersonating anon/authenticated:
-- anon sees 0 rows; users can't set is_admin/credits or call credit RPCs; own safe
-- profile columns still update.

-- 1. Drop permissive "all roles, USING true" policies. The service role bypasses RLS,
--    so these protected nothing and exposed every row to the public anon key.
DROP POLICY IF EXISTS "Service role has full access to generations" ON public.ai_generations;
DROP POLICY IF EXISTS "Service role has full access to projects"    ON public.projects;
DROP POLICY IF EXISTS "Service role has full access to usage_logs"  ON public.usage_logs;
DROP POLICY IF EXISTS "Service role has full access to users"       ON public.users;
DROP POLICY IF EXISTS "Service role has full access to videos"      ON public.videos;
DROP POLICY IF EXISTS "Allow read videos"   ON public.videos;
DROP POLICY IF EXISTS "Allow insert videos" ON public.videos;

-- Anonymous callers never write user data.
REVOKE INSERT, UPDATE, DELETE ON public.projects, public.ai_generations, public.videos,
  public.usage_logs, public.users, public.video_segments, public.user_profiles FROM anon;

-- 2. user_profiles: credits, admin, billing and voice-clone ids are server-only.
--    Rows are created by the handle_new_user trigger, so clients never insert/delete
--    (client code uses .update(), not .upsert()).
REVOKE INSERT, UPDATE, DELETE ON public.user_profiles FROM authenticated;
GRANT UPDATE (caption_outro, preferred_voice_id, updated_at,
              instagram_account_id, instagram_access_token,
              instagram_token_expires_at, instagram_username)
  ON public.user_profiles TO authenticated;

-- 3. ai_generations: clients only edit style settings and reset a job for retry.
REVOKE INSERT, UPDATE, DELETE ON public.ai_generations FROM authenticated;
GRANT UPDATE (remove_fillers, filler_overrides, broll_layout,
              status, debug_log, stitched_video_url,
              video_url_1, video_url_2, video_url_3, video_url_4, video_url_5, kling_task_ids)
  ON public.ai_generations TO authenticated;

-- 4. Credit/refund functions are server-only (edge functions + Railway use the service role).
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace
             AND p.proname IN ('add_credits','increment_credit','decrement_credit',
                               'sweep_stuck_generations','refund_credit_on_failure')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- 5. Refund trigger: only honour status changes made server-side (service role, cron,
--    migrations). A user flipping their own row to 'failed' must never mint a credit.
CREATE OR REPLACE FUNCTION public.refund_credit_on_failure()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $function$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
BEGIN
  IF NEW.status = 'failed'
     AND (OLD.status IS DISTINCT FROM 'failed')
     AND coalesce(auth.role(), 'service_role') = 'service_role' THEN
    SELECT p.user_id INTO v_user_id FROM projects p WHERE p.id = NEW.project_id;
    IF v_user_id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT is_admin INTO v_is_admin FROM user_profiles WHERE id = v_user_id;
    IF NOT COALESCE(v_is_admin, false) THEN
      UPDATE user_profiles SET credits_remaining = credits_remaining + 1 WHERE id = v_user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 6. Storage: uploads only into the caller's own folder ({user_id}/{project_id}/file),
--    and no API listing/enumeration of other users' uploads. Direct public URLs still
--    resolve (bucket is public; paths use unguessable UUIDs) — moving to a private
--    bucket + signed URLs is a follow-up.
DROP POLICY IF EXISTS "Authenticated users can upload to user-videos" ON storage.objects;
CREATE POLICY "Users upload to own folder in user-videos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Public read for user-videos" ON storage.objects;
CREATE POLICY "Users read own files in user-videos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'user-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
