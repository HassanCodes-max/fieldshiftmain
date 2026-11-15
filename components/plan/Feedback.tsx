"use client";

import { useState } from "react";
import { getDict, type Lang } from "@/lib/i18n";

export function Feedback({ lang, planId, region }: { lang: Lang; planId: string; region?: string }) {
  const d = getDict(lang);
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState("");

  async function send() {
    if (helpful === null) return;
    setState("sending");
    try {
      const r = await fetch("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, helpful, comment: comment.trim() || undefined, lang, region }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setState("done");
    } catch (e) {
      setErr((d.errors as Record<string, string>)[(e as Error).message] ?? d.errors.internal_error);
      setState("error");
    }
  }

  if (state === "done") return <p className="rounded-xl bg-olive-100 px-4 py-3 text-olive-800">{d.plan.feedbackThanks}</p>;
  return (
    <div className="card p-5">
      <p className="font-display text-lg text-forest-900">{d.plan.feedbackQ}</p>
      <div className="mt-3 flex gap-2">
        {([true, false] as const).map((v) => (
          <button key={String(v)} type="button" aria-pressed={helpful === v} onClick={() => setHelpful(v)}
            className={`min-h-11 rounded-full border px-5 ${helpful === v ? "border-forest-900 bg-forest-900 text-cream" : "border-soil-300 bg-paper hover:bg-beige-100"}`}>
            {v ? d.common.yes : d.common.no}
          </button>
        ))}
      </div>
      <label className="mt-3 block">
        <span className="sr-only">{d.plan.commentPh}</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 500))} maxLength={500} rows={3} placeholder={d.plan.commentPh}
          className="w-full rounded-xl border border-soil-200 bg-paper px-3 py-2 text-[0.95rem] outline-none focus:border-forest-600" />
      </label>
      <button type="button" onClick={send} disabled={helpful === null || state === "sending"}
        className="mt-2 min-h-11 rounded-full bg-soil-800 px-5 font-medium text-cream disabled:opacity-40">{d.plan.send}</button>
      {state === "error" && <p className="mt-2 text-sm text-clay-700">{err}</p>}
    </div>
  );
}
