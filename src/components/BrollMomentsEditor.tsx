import { useState } from "react";
import { toast } from "sonner";
import BrollLayoutIcon from "@/components/BrollLayoutIcon";

// Results-page editor for a talking-head video's b-roll: change a moment's layout,
// swap its clip (optionally with a new search), or remove it, then re-render with
// exactly those choices. Backed by the edit-broll edge function.

export interface BrollPlanMoment {
  wordIndex: number;
  from: number | null;
  durationInFrames: number;
  layout: string;
  query: string;
  reason: string;
  clipUrl: string | null;
  removed?: boolean;
}
export interface BrollPlan {
  moments: BrollPlanMoment[];
  emphasisWordIndices: number[];
  locked?: boolean;
}

const LAYOUT_OPTIONS: [string, string][] = [
  ["fullscreen", "Full screen"], ["top-three-quarters", "Top ¾"], ["top-half", "Top half"],
  ["bottom-third", "Bottom third"], ["corner", "Corner"], ["floating", "Floating"],
];

const fmt = (frames: number) => `${Math.floor(frames / 1800)}:${String(Math.floor((frames / 30) % 60)).padStart(2, "0")}`;

export default function BrollMomentsEditor({ projectId, plan, accessToken, onPlanChange, onRerender, rerendering }: {
  projectId: string;
  plan: BrollPlan;
  accessToken: string;
  onPlanChange: (plan: BrollPlan) => void;
  onRerender: () => void;
  rerendering: boolean;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [searchFor, setSearchFor] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");

  const call = async (index: number, body: Record<string, unknown>) => {
    setBusy(index);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/edit-broll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ project_id: projectId, index, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Couldn't make that change"); return; }
      const moments = plan.moments.map((m, i) => {
        if (i !== index) return m;
        if (body.action === "swap") return { ...m, clipUrl: data.clipUrl, query: data.query ?? m.query };
        if (body.action === "layout") return { ...m, layout: String(body.layout) };
        if (body.action === "remove") return { ...m, removed: true };
        return { ...m, removed: false };
      });
      onPlanChange({ ...plan, moments, locked: true });
      setSearchFor(null);
    } finally {
      setBusy(null);
    }
  };

  const visible = plan.moments.map((m, i) => ({ m, i })).filter(({ m }) => m.clipUrl && m.from !== null);

  return (
    <div>
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">B-roll moments</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">Change a layout, swap a clip, or remove one — then re-render.</p>
      </div>
      <div className="divide-y divide-gray-800/60">
        {visible.map(({ m, i }) => (
          <div key={i} className="px-4 py-3" style={{ opacity: m.removed ? 0.45 : 1 }}>
            <div className="flex gap-3">
              <video
                src={m.clipUrl ?? undefined}
                muted playsInline loop preload="metadata"
                onMouseEnter={e => e.currentTarget.play().catch(() => {})}
                onMouseLeave={e => e.currentTarget.pause()}
                className="rounded-md bg-black flex-shrink-0"
                style={{ width: 54, height: 96, objectFit: "cover" }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-gray-500">{fmt(m.from ?? 0)} · {(m.durationInFrames / 30).toFixed(1)}s</span>
                  <BrollLayoutIcon layout={m.layout} color="oklch(72% 0.17 280)" />
                </div>
                <p className="text-xs text-gray-300 mt-1 truncate" title={m.reason}>“{m.query}”</p>
                {!m.removed && (
                  <select
                    aria-label="Layout"
                    value={m.layout}
                    disabled={busy !== null}
                    onChange={e => call(i, { action: "layout", layout: e.target.value })}
                    className="mt-2 w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-gray-200"
                  >
                    {LAYOUT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                )}
              </div>
            </div>
            {searchFor === i ? (
              <form className="flex gap-2 mt-2" onSubmit={e => { e.preventDefault(); call(i, { action: "swap", query: searchText }); }}>
                <input
                  autoFocus
                  aria-label="Search for footage"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  placeholder="e.g. library shelves"
                  className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-gray-200"
                />
                <button type="submit" disabled={busy !== null} className="px-2 py-1 rounded-md bg-violet-500 text-gray-950 text-xs font-semibold disabled:opacity-60">
                  {busy === i ? "…" : "Find"}
                </button>
                <button type="button" onClick={() => setSearchFor(null)} className="text-xs text-gray-500">Cancel</button>
              </form>
            ) : (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
                {m.removed ? (
                  <button type="button" disabled={busy !== null} onClick={() => call(i, { action: "restore" })} className="text-violet-400 hover:text-violet-300">
                    {busy === i ? "Restoring…" : "Restore"}
                  </button>
                ) : (
                  <>
                    <button type="button" disabled={busy !== null} onClick={() => call(i, { action: "swap" })} className="text-violet-400 hover:text-violet-300 disabled:opacity-60">
                      {busy === i ? "Finding…" : "Different clip"}
                    </button>
                    <button type="button" disabled={busy !== null} onClick={() => { setSearchFor(i); setSearchText(m.query); }} className="text-gray-400 hover:text-gray-200">
                      Search…
                    </button>
                    <button type="button" disabled={busy !== null} onClick={() => call(i, { action: "remove" })} className="text-gray-500 hover:text-red-400">
                      Remove
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && <p className="px-4 py-4 text-xs text-gray-500">This video has no b-roll moments.</p>}
      </div>
      {plan.locked && (
        <div className="p-4 border-t border-gray-800">
          <button
            type="button"
            onClick={onRerender}
            disabled={rerendering || busy !== null}
            className="w-full py-2.5 rounded-lg bg-violet-500 hover:bg-violet-400 text-sm font-semibold text-gray-950 disabled:opacity-60"
          >
            {rerendering ? "Starting…" : "Re-render with your changes · 1 credit"}
          </button>
        </div>
      )}
    </div>
  );
}
