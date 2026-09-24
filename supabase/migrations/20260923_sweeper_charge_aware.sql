-- Supersedes the sweep_stuck_generations() in 20260902_stuck_job_sweeper.sql, which had two bugs:
--   1. It treated 'processing' as post-charge. agent-content sets 'processing' BEFORE any charge,
--      so sweeping it to 'failed' fired the refund trigger and minted an uncharged credit.
--   2. It measured age from created_at (caption/transcription time). Users can review for any
--      length of time before rendering, so a healthy render that had just started could be
--      swept as "stuck" on the next 15-minute tick.
-- Fix: measure from status_changed_at (maintained by trigger), and only move charged stages to
-- 'failed' (refund); uncharged stages get their own error status (no refund).

ALTER TABLE public.ai_generations
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_status_changed_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_status_changed_at ON public.ai_generations;
CREATE TRIGGER trg_set_status_changed_at
  BEFORE INSERT OR UPDATE ON public.ai_generations
  FOR EACH ROW EXECUTE FUNCTION public.set_status_changed_at();

CREATE OR REPLACE FUNCTION public.sweep_stuck_generations()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  charged integer;
  uncharged_captions integer;
  uncharged_transcripts integer;
BEGIN
  -- Post-charge pipeline stages (credit taken in agent-video / trigger-caption-video).
  -- render_queued = claimed by trigger-render but Railway never started the Lambda render.
  UPDATE ai_generations
    SET status = 'failed', debug_log = coalesce(debug_log, 'Swept: stuck in ' || status)
    WHERE (status IN ('generating_videos', 'ai_tasks_created', 'ai_tasks_done', 'generating_broll', 'render_queued')
           AND status_changed_at < now() - interval '30 minutes')
       OR (status = 'remotion_rendering' AND status_changed_at < now() - interval '60 minutes');
  GET DIAGNOSTICS charged = ROW_COUNT;

  -- Pre-charge: caption generation (agent-content never charges).
  UPDATE ai_generations
    SET status = 'caption_error', debug_log = coalesce(debug_log, 'Swept: caption generation stalled')
    WHERE status = 'processing' AND status_changed_at < now() - interval '15 minutes';
  GET DIAGNOSTICS uncharged_captions = ROW_COUNT;

  -- Pre-charge: transcription (transcribe-video never charges).
  UPDATE ai_generations
    SET status = 'transcription_error', debug_log = coalesce(debug_log, 'Swept: transcription stalled')
    WHERE status = 'transcribing' AND status_changed_at < now() - interval '30 minutes';
  GET DIAGNOSTICS uncharged_transcripts = ROW_COUNT;

  RETURN charged + uncharged_captions + uncharged_transcripts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sweep_stuck_generations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_stuck_generations() TO service_role;
REVOKE EXECUTE ON FUNCTION public.set_status_changed_at() FROM PUBLIC, anon, authenticated;
