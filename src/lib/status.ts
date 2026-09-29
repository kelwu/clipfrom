// Shared interpretation of ai_generations.status across screens.

/** Terminal failure: failed, kling_all_failed, all_clips_failed, and any *_error. */
export function isFailedStatus(status: string | null | undefined): boolean {
  const s = status ?? "";
  return s.endsWith("failed") || s.endsWith("_error");
}

/** A final render is queued or running (article render or talking-head render). */
export function isRenderingStatus(status: string | null | undefined): boolean {
  return status === "render_queued" || status === "remotion_rendering";
}
