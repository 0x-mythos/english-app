"use client";

import { useState } from "react";
import { PlusIcon } from "@/components/icons";
import { api } from "@/lib/tg-client";

type Card = { word: string; translation: string; transcription: string; example: string };
type Result = { status: "added" | "exists"; card: Card };

const ERRORS: Record<string, string> = {
  http_422: "Не схоже на англійське слово. Перевір написання?",
  http_502: "AI зараз не відповів, спробуй ще раз.",
};

// «Своє слово»: слово (+ необов'язково речення, де воно трапилось) → Claude дописує → картка серед нових.
export function AddWord({ onAdded }: { onAdded?: () => void }) {
  const [word, setWord] = useState("");
  const [context, setContext] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!word.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api<Result>("/api/cards/own", { word, context: context || undefined });
      setResult(r);
      setWord("");
      setContext("");
      setShowContext(false);
      if (r.status === "added") onAdded?.();
    } catch (err) {
      setError(ERRORS[(err as Error).message] ?? "Не вийшло додати, спробуй ще раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[24px] bg-surface px-4 pb-4 pt-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-berry/18 text-berry">
          <PlusIcon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 className="font-display text-[16px] font-semibold">Своє слово</h2>
          <p className="text-[13px] leading-snug text-muted">Побачив незнайоме — додай, AI допише переклад і приклад. Або надішли його боту.</p>
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="напр. deprecate"
            maxLength={60}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-label="Англійське слово або фраза"
            className="min-w-0 flex-1 rounded-xl bg-background px-3.5 py-2.5 text-[16px] outline-none ring-1 ring-line placeholder:text-muted/70 focus:ring-2 focus:ring-berry"
          />
          <button
            type="submit"
            disabled={busy || !word.trim()}
            className="shrink-0 rounded-xl bg-berry px-4 text-[15px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {busy ? "…" : "Додати"}
          </button>
        </div>
        {showContext ? (
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Речення, де ти його побачив — тоді переклад буде саме в цьому значенні"
            maxLength={300}
            rows={2}
            className="resize-none rounded-xl bg-background px-3.5 py-2.5 text-[15px] outline-none ring-1 ring-line placeholder:text-muted/70 focus:ring-2 focus:ring-berry"
          />
        ) : (
          <button type="button" onClick={() => setShowContext(true)} className="self-start text-[13px] font-medium text-muted hover:text-foreground">
            + речення, де трапилось
          </button>
        )}
      </form>

      {busy && <p className="text-[13px] text-muted">AI дописує картку…</p>}
      {error && <p className="text-[14px] text-accent">{error}</p>}
      {result && (
        <div className="pop-in flex flex-col gap-1 rounded-xl bg-berry/10 px-3.5 py-3">
          <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-berry">
            {result.status === "added" ? "Додано в картки" : "Вже є в картках"}
          </span>
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-[18px] font-semibold">{result.card.word}</span>
            {result.card.transcription && <span className="font-mono text-[13px] text-muted">[{result.card.transcription}]</span>}
          </span>
          <span className="text-[15px]">{result.card.translation}</span>
          {result.card.example && <span className="text-[14px] italic leading-snug text-muted">{result.card.example}</span>}
        </div>
      )}
    </section>
  );
}
