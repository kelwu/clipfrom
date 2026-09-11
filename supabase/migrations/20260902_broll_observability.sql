-- B-roll observability: record the caption pipeline's b-roll outcome so a miss is visible
-- in the admin Pipeline view instead of silently shipping a talking-head video with no cutaways.
-- broll_count = number of cutaways rendered; broll_error = categorized reason when empty
-- (no_moments_identified | pexels_no_results | all_moments_in_removed_segments | exception: …).
ALTER TABLE ai_generations ADD COLUMN IF NOT EXISTS broll_count integer;
ALTER TABLE ai_generations ADD COLUMN IF NOT EXISTS broll_error text;
