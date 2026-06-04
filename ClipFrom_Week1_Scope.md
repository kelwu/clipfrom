# Week 1 Scope — Filler Word Removal + Preview-Before-Render

**Goal:** Make Upload Mode feel like a real product. After this week, a user can upload a talking-head video, see exactly what the rendered output will look like in the browser before spending a credit, and have filler words ("um/uh/like") automatically removed.

**Scope boundary:** Upload Mode only. Article Mode preview is a Week 4+ effort because it requires generating B-roll first.

---

## Decision Points (need confirmation before building)

These are the architectural choices that ripple downstream. My recommended answer is in **bold**; flag if you want to override.

### D1. Where does filler detection run?
- (a) In `transcribe-video` edge function, persisted on `ai_generations` ←  **recommend**
- (b) In Railway pipeline, computed at render time
- (c) Client-side in the browser

Why (a): we want the user to be able to *preview and override* filler decisions in the editor. That means the data has to exist before the render starts, on the row, queryable. Computing client-side means we'd need to re-derive on every page load.

### D2. One composition with an optional EDL prop, or two compositions?
- (a) Extend `UserVideoCaption` with optional `keepSegments` prop — uses sequences when present, single OffthreadVideo when absent ← **recommend**
- (b) New `UserVideoCaptionWithCuts` composition

Why (a): the math is the same regardless of cuts (it's just `keepSegments = [{start: 0, end: total}]` for "no cuts"). Two compositions = double maintenance.

### D3. How do we share the composition between Lambda render and browser Player?
- (a) Duplicate `UserVideoCaption.tsx` into `clipfrom/src/remotion/`, manual sync ← **recommend for now**
- (b) Set up a pnpm/npm workspace so both projects import from the same source
- (c) Publish compositions as an npm package

Why (a): the composition changes rarely; the friction of (b)/(c) is real and the duplication cost is one file. Revisit if we add more compositions.

### D4. What's the default for filler removal — opt-in or opt-out?
- (a) Opt-in (checkbox unchecked by default) ← **recommend for v1**
- (b) Opt-out (checkbox checked, user uncheck to keep fillers)

Why (a): conservative for v1. Once we trust the detection, flip to opt-out.

---

## Backend changes

### Database migration

```sql
-- Augment transcript_words with filler detection.
-- We don't add columns to ai_generations — instead each word object in the
-- transcript_words JSONB array gains an is_filler boolean.

-- New column for the user's overrides (a set of word indexes to force-keep)
ALTER TABLE ai_generations
  ADD COLUMN IF NOT EXISTS filler_overrides INT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS remove_fillers BOOLEAN DEFAULT FALSE;

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_ai_generations_status ON ai_generations(status);
```

### `transcribe-video` edge function

Two changes:

**1. Add filler detection after Scribe responds.**

```ts
const FILLER_WORDS = new Set([
  "um", "uh", "uhh", "uhm", "umm", "er", "erm",
  "like", "you know", "i mean", "kinda", "sorta",
  "basically", "literally", "actually", "right",
  "ah", "ahh", "mhm", "hmm", "okay so", "so basically"
]);

// Multi-word fillers need lookahead matching against consecutive words
function detectFillers(words: ScribeWord[]): ScribeWord[] {
  return words.map((w, i) => {
    if (w.type !== "word") return w;
    const lower = w.text.toLowerCase().replace(/[^a-z]/g, "");
    // Single-word check
    if (FILLER_WORDS.has(lower)) return { ...w, is_filler: true };
    // Two-word lookahead ("you know", "i mean", etc.)
    const next = words[i + 1];
    if (next && next.type === "word") {
      const combined = `${lower} ${next.text.toLowerCase().replace(/[^a-z]/g, "")}`;
      if (FILLER_WORDS.has(combined)) return { ...w, is_filler: true };
    }
    return { ...w, is_filler: false };
  });
}
```

**2. Surface filler count in the response** so the frontend can show "Detected 14 fillers (-6.2s)" immediately:

```ts
const fillerCount = transcriptWords.filter(w => w.is_filler).length;
const fillerSeconds = transcriptWords
  .filter(w => w.is_filler)
  .reduce((sum, w) => sum + (w.endFrame - w.startFrame) / 30, 0);

return new Response(
  JSON.stringify({ success: true, word_count: wordCount, filler_count: fillerCount, filler_seconds: fillerSeconds }),
  ...
);
```

### `pipeline.ts` — `runCaptionPipeline` changes

Read the new fields, build the EDL, pass it to Remotion.

```ts
const { data: gen } = await fetch(
  `${SUPABASE_URL}/rest/v1/ai_generations?id=eq.${ai_gen_id}&select=user_video_url,transcript_words,video_duration_frames,remove_fillers,filler_overrides`,
  ...
);

// Build keepSegments EDL
const keepSegments = gen.remove_fillers
  ? buildKeepSegments(transcript_words, filler_overrides, video_duration_frames)
  : null; // null = play full video, no cuts

// Pass to composition
inputProps: {
  videoUrl,
  transcriptWords,
  brollSegments: [],
  captionStyle: captionStyle ?? "pill",
  keepSegments, // NEW
}
```

The `buildKeepSegments` helper (50-line function):

```ts
interface KeepSegment {
  source_start_frame: number;
  source_end_frame: number;
}

function buildKeepSegments(
  words: TranscriptWord[],
  overrides: number[],
  totalFrames: number
): KeepSegment[] {
  const overrideSet = new Set(overrides);
  const SILENCE_BUFFER = 6; // frames (~200ms at 30fps) around each cut for clean audio

  // Find frame ranges to REMOVE: filler words not overridden
  const removeRanges = words
    .map((w, i) => ({ word: w, index: i }))
    .filter(({ word, index }) => word.is_filler && !overrideSet.has(index))
    .map(({ word }) => ({
      start: Math.max(0, word.startFrame - SILENCE_BUFFER),
      end: Math.min(totalFrames, word.endFrame + SILENCE_BUFFER),
    }));

  // Merge overlapping removal ranges
  const merged = removeRanges
    .sort((a, b) => a.start - b.start)
    .reduce<typeof removeRanges>((acc, r) => {
      const last = acc[acc.length - 1];
      if (last && r.start <= last.end) {
        last.end = Math.max(last.end, r.end);
        return acc;
      }
      return [...acc, r];
    }, []);

  // Invert: build keep segments from the gaps between removals
  const keeps: KeepSegment[] = [];
  let cursor = 0;
  for (const remove of merged) {
    if (remove.start > cursor) {
      keeps.push({ source_start_frame: cursor, source_end_frame: remove.start });
    }
    cursor = remove.end;
  }
  if (cursor < totalFrames) {
    keeps.push({ source_start_frame: cursor, source_end_frame: totalFrames });
  }
  return keeps;
}
```

---

## Remotion composition changes

### `UserVideoCaption.tsx` updates

Add the optional `keepSegments` prop. When provided, render as a series of `Sequence` elements; when absent, current behavior.

```tsx
export interface UserVideoCaptionProps {
  videoUrl: string;
  transcriptWords: TranscriptWord[];
  brollSegments: BrollSegment[];
  captionStyle?: CaptionStyle;
  musicUrl?: string;
  keepSegments?: { source_start_frame: number; source_end_frame: number }[]; // NEW
}

// Compute output-frame-to-source-frame mapping for caption timing remap
function buildFrameMap(keepSegments: KeepSegment[]): Map<number, number> {
  const map = new Map<number, number>();
  let outputFrame = 0;
  for (const seg of keepSegments) {
    for (let src = seg.source_start_frame; src < seg.source_end_frame; src++) {
      map.set(src, outputFrame);
      outputFrame++;
    }
  }
  return map;
}

// In the render:
{keepSegments ? (
  // Cut version: sequence of trimmed video segments
  (() => {
    let cursor = 0;
    return keepSegments.map((seg, i) => {
      const duration = seg.source_end_frame - seg.source_start_frame;
      const from = cursor;
      cursor += duration;
      return (
        <Sequence key={i} from={from} durationInFrames={duration}>
          <OffthreadVideo
            src={videoUrl}
            startFrom={seg.source_start_frame}
            endAt={seg.source_end_frame}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Sequence>
      );
    });
  })()
) : (
  // Original full-video render
  <OffthreadVideo src={videoUrl} style={{ ... }} />
)}
```

### Caption timing remap

Captions reference `startFrame` based on the *source* video. If we cut, the captions need to render at the *output* frame:

```ts
// In findActiveWordIndex, when keepSegments is present:
const frameMap = keepSegments ? buildFrameMap(keepSegments) : null;
const wordsForRender = frameMap
  ? words
      .filter(w => frameMap.has(w.startFrame)) // skip words inside removed segments
      .map(w => ({
        ...w,
        startFrame: frameMap.get(w.startFrame)!,
        endFrame: frameMap.get(w.endFrame) ?? frameMap.get(w.startFrame)!,
      }))
  : words;
```

### Composition needs to work in Player (browser)

Player doesn't support `OffthreadVideo` (server-only). Wrap with a runtime check:

```ts
import { Video, OffthreadVideo } from "remotion";

// Use Video in browser, OffthreadVideo in Lambda
const VideoElement = typeof window !== "undefined" && !window.remotion_isPlayer
  ? OffthreadVideo
  : Video;
```

Actually the cleaner pattern per Remotion docs:
```ts
import { OffthreadVideo, Video, getRemotionEnvironment } from "remotion";

const VideoElement = getRemotionEnvironment().isPlayer ? Video : OffthreadVideo;
```

---

## Frontend changes

### New route: `/preview/:projectId`

After `transcribe-video` succeeds, navigate here instead of auto-triggering render.

Component structure:

```
PreviewPage
├── <Player>                          # Remotion browser preview
│   └── UserVideoCaption (composition)
├── PreviewControls
│   ├── Caption style picker (3 styles)
│   ├── Filler removal toggle
│   │   └── "We detected 14 fillers (-6.2s). [Preview] [Edit list]"
│   ├── Filler review modal (optional)
│   │   └── List of fillers with keep/remove checkboxes
│   └── Big "Render Final Video" button (consumes credit)
└── ProjectMeta (video name, duration, etc.)
```

### Files to add/modify

**New file:** `clipfrom/src/pages/Preview.tsx`
- Read `projectId` from URL params
- Fetch `ai_generations` row (has `transcript_words`, `user_video_url`, `video_duration_frames`)
- Mount `<Player>` from `@remotion/player`
- Caption style picker writes to local state, passed as `inputProps` to Player
- Filler toggle writes `remove_fillers` to DB on change (live updates Player)
- "Render" button calls `trigger-caption-video` with current settings

**New file:** `clipfrom/src/remotion/UserVideoCaption.tsx`
- Direct copy of the Lambda composition (sync manually for now)
- Uses the `getRemotionEnvironment().isPlayer` swap for Video/OffthreadVideo

**Modify:** `clipfrom/src/pages/ArticleInput.tsx`
- After `transcribe-video` returns `captions_ready`, navigate to `/preview/${projectId}` instead of auto-triggering render

**Modify:** `clipfrom/package.json`
- Add `@remotion/player` and `remotion` as dependencies
- Match versions to `clipfrom-remotion`

### Dependencies to install

```bash
cd "C:\Users\wuazn\Desktop\Product by Kel\Projects\clipfrom"
npm install @remotion/player remotion
```

Versions: pin to whatever `clipfrom-remotion/package.json` uses to avoid drift.

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Audio jumps sound bad at cut boundaries | High | 6-frame silence buffer in `buildKeepSegments`; only cut on word boundaries Scribe already aligned to silence |
| Caption timestamp drift after remap | Medium | Snapshot tests: build a `keepSegments`, remap a known transcript, verify output frames are correct |
| Filler detection is too aggressive (cuts meaningful "so" or "right") | Medium | Conservative filler list for v1; user override list provides escape hatch |
| `Player` bundle size adds ~250KB to frontend | Low | Lazy-load Preview page so it only loads when navigating there |
| Composition file drifts between Lambda and Player versions | Medium | Add a CI check that diffs the two `.tsx` files; warn if they diverge |
| `OffthreadVideo` `startFrom`/`endAt` precision at cut points | Low (Remotion handles this well) | Test with a sample video; verify no missed frames |
| User uploads video where filler removal cuts >50% of content (rare, e.g. all "ums") | Low | Show warning in UI: "This will remove 47% of your video. Continue?" |

---

## Build sequence (recommended order)

The order matters because some pieces unblock others.

**Day 1 — Filler detection backend**
1. Apply database migration
2. Update `transcribe-video` with filler detection + response shape
3. Deploy
4. Smoke-test with a real video upload — verify `transcript_words[i].is_filler` is set correctly
5. ~3 hours

**Day 2 — EDL + pipeline integration**
1. Add `buildKeepSegments` to `pipeline.ts`
2. Update `runCaptionPipeline` to read settings + pass `keepSegments` to composition
3. Update `UserVideoCaption.tsx` (Lambda copy) with `keepSegments` rendering + caption remap
4. Deploy site to S3 (`npm run deploy-site` in `clipfrom-remotion`)
5. Test render with `remove_fillers: true` manually set in DB
6. ~6 hours including testing

**Day 3 — Preview page foundation**
1. Install `@remotion/player`, `remotion` in `clipfrom`
2. Copy `UserVideoCaption.tsx` into `clipfrom/src/remotion/`
3. Add the `getRemotionEnvironment().isPlayer` swap
4. Build `Preview.tsx` with `<Player>` rendering the composition
5. Wire up `inputProps` from DB
6. Test: navigate to `/preview/:projectId` manually, verify playback
7. ~5 hours

**Day 4 — Controls + flow integration**
1. Caption style picker on Preview page (live updates Player)
2. Filler removal toggle (live updates Player)
3. "Render Final Video" button → calls `trigger-caption-video`
4. Update `ArticleInput.tsx` to navigate to `/preview/:projectId` after transcription
5. End-to-end test: upload → transcribe → preview → render
6. ~5 hours

**Day 5 — Polish + edge cases**
1. Filler review modal (let user uncheck specific filler words)
2. UI feedback: "Detected 14 fillers, saves 6.2s"
3. Warning if removal cuts >50% of video
4. Loading states, error handling
5. Manual QA across 3-5 sample videos
6. ~4 hours

**Total: ~23 hours of focused work, fits in a 5-day week with buffer.**

---

## Out-of-scope for Week 1 (explicitly)

These came up but we're not doing them this week:

- **Article Mode preview** — needs B-roll generation first; bigger architectural change. Week 4+.
- **Pause compression** — removing long silences between sentences. Useful but not what Submagic does. Defer.
- **Per-word filler review UI** — checkbox per filler. Nice-to-have. Defer to Day 5 stretch if time permits.
- **Custom filler dictionary per user** — let users add their own. Defer.
- **Multi-language filler detection** — English only for v1.
- **Audio crossfade at cut points** — for v1, hard cuts on silence boundaries. If audible artifacts, add crossfade in v2.

---

## Definition of done for Week 1

- A user uploads a 30-second talking-head video with 5+ filler words.
- After transcription, they land on `/preview/:projectId` showing the Remotion `<Player>` with their video and word-highlighted captions.
- The "Remove filler words" toggle works live in the preview — fillers disappear, captions remap, no desync.
- Caption style toggle works live.
- "Render Final Video" produces a Lambda render matching the preview exactly.
- Final MP4 has fillers removed when toggle was on; matches preview.

---

## Open questions to answer before Day 1

1. Are we OK with the duplicated `UserVideoCaption.tsx` file approach (D3 (a))? Or should we set up the workspace now?
2. Default for filler removal: opt-in or opt-out (D4)?
3. Do we want the per-word filler review UI as a Day 5 must-have, or punt to Week 2?
4. Should the Preview page replace or augment the existing flow? (I'm assuming replace — Upload Mode currently auto-renders after transcription, so the preview step is net new.)
