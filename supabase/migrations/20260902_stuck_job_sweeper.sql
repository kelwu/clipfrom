-- Stuck-job sweeper: auto-fail generations that die mid-pipeline so they don't hang forever
-- (we cleared 28 by hand on 2026-09-02) and so the user gets their credit back.
--
-- IMPORTANT: credit refunds are already handled centrally by the existing
-- `trg_refund_credit_on_failure` trigger (AFTER UPDATE OF status), which issues a single,
-- admin-aware +1 refund on any transition to status='failed'. This sweeper therefore ONLY
-- flips stuck jobs to 'failed' and lets the trigger refund — it must never refund directly
-- (doing so double-refunds). Idempotency comes from the trigger's
-- "OLD.status IS DISTINCT FROM 'failed'" guard plus this function's WHERE, which excludes
-- rows that are already 'failed'.

CREATE OR REPLACE FUNCTION public.sweep_stuck_generations()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  swept integer;
BEGIN
  -- Only machine-in-progress states stuck > 30 min. These are unambiguously post-charge,
  -- so the refund trigger firing is correct. Deliberately NOT swept:
  --   * user-gated states (captions_ready, videos_ready) — these legitimately wait on the user
  --   * 'pending' — its charge status is ambiguous; flipping it to failed could wrongly refund.
  --     Abandoned pending rows are cleaned up separately (manual delete, like the 28 above).
  UPDATE ai_generations
    SET status = 'failed'
    WHERE status IN ('processing', 'generating_videos')
      AND created_at < now() - interval '30 minutes';
  GET DIAGNOSTICS swept = ROW_COUNT;
  RETURN swept;
END;
$$;

-- Run every 15 minutes (pg_cron already runs cleanup-old-voiceovers on this project).
-- Scalar (RETURNS integer) so the body executes exactly once per call — a set-returning
-- (RETURNS TABLE) function called as `SELECT fn()` in the target list double-executes its
-- side effects, which would double-flip/refund. Do not change the return type without also
-- changing how it is invoked.
SELECT cron.schedule('sweep-stuck-generations', '*/15 * * * *', $$SELECT public.sweep_stuck_generations();$$);
