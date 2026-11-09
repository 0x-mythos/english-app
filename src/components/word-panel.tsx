"use client";

import { forwardRef, useState } from "react";
import { PlusIcon } from "@/components/icons";
import { OWN_WORD_LIMIT_MESSAGE } from "@/lib/own-word-limit";
import { api } from "@/lib/tg-client";
import { formatIpa } from "@/lib/ipa";

export type Lookup =
  | { status: "loading" }
  | { status: "error" }
  | { status: "found"; source: "glossary" | "words" | "dictionary"; word: string; lemma: string; translation: string; transcription: string | null }
  | { status: "in_cards"; word: string; translation: string; transcription: string | null }
  | { status: "unknown"; word: string };

type CardResult = { status: "added" | "exists"; card: { word: string; translation: string; transcription: string; example: string } };

const ERRORS: Record<string, string> = {
  http_429: OWN_WORD_LIMIT_MESSAGE,
  http_422: "Не схоже на англійське слово.",
  http_502: "AI зараз не відповів, спробуй ще раз.",
};

const action = "w-full rounded-2xl bg-mint py-3.5 text-[16px] font-bold text-ink shadow-card transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40";

/** Панель перекладу внизу екрана: переклад, транскрипція, «+» (або «Вже в картках» / «Додати як своє слово»). */
export const WordPanel = forwardRef<
  HTMLDivElement,
  { word: string; sentence: string; textId: string; lookup: Lookup; onClose: () => void; onAdded: () => void }
>(function WordPanel({ word, sentence, textId, lookup, onClose, onAdded }, ref) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CardResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(path: "/api/reading/card" | "/api/cards/own") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = path === "/api/reading/card" ? { textId, word, sentence } : { word, context: sentence };
      const r = await api<CardResult>(path, body);
      setDone(r);
      if (r.status === "added") onAdded();
    } catch (e) {
      setError(ERRORS[(e as Error).message] ?? "Не вдалося додати, спробуй ще раз.");
    } finally {
      setBusy(false);
    }
  }

  const translation = done ? done.card.translation : lookup.status === "found" || lookup.status === "in_cards" ? lookup.translation : null;
  const transcription = done ? done.card.transcription : lookup.status === "found" || lookup.status === "in_cards" ? lookup.transcription : null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Переклад: ${word}`}
      className="pop-in fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md flex-col gap-3 rounded-t-[28px] bg-surface px-5 pb-6 pt-4 shadow-card ring-1 ring-line"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-display text-[22px] font-semibold leading-tight">{word}</span>
          {transcription && <span className="text-[14px] text-muted">{formatIpa(transcription)}</span>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрити"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-line text-[20px] leading-none text-muted"
        >
          ×
        </button>
      </div>

      {lookup.status === "loading" && <div className="h-5 w-40 animate-pulse rounded-full bg-line" />}
      {lookup.status === "error" && <p className="text-[15px] text-accent">Не вдалося знайти переклад. Перевір з&apos;єднання.</p>}
      {translation && <p className="text-[18px] font-medium leading-snug">{translation}</p>}

      {lookup.status === "unknown" && !done && (
        <>
          <p className="text-[15px] leading-snug text-muted">Перекладу немає. Можна додати як своє слово — AI допише переклад і приклад.</p>
          <button type="button" className={action} disabled={busy} onClick={() => add("/api/cards/own")}>
            {busy ? "…" : "Додати як своє слово"}
          </button>
        </>
      )}

      {lookup.status === "found" && !done && (
        <button type="button" className={`${action} flex items-center justify-center gap-2`} disabled={busy} onClick={() => add("/api/reading/card")}>
          <PlusIcon className="size-5" /> {busy ? "…" : "Додати в картки"}
        </button>
      )}

      {lookup.status === "in_cards" && <span className="self-start rounded-full bg-mint/20 px-3 py-1 text-[13px] font-semibold text-mint">Вже в картках</span>}
      {done && (
        <span className="self-start rounded-full bg-mint/20 px-3 py-1 text-[13px] font-semibold text-mint">
          {done.status === "exists" ? "Вже в картках" : "Додано в картки"}
        </span>
      )}
      {error && <p className="text-[14px] font-medium leading-snug text-accent" role="alert">{error}</p>}
    </div>
  );
});
