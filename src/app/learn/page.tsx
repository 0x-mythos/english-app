"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { clozeMatches } from "@/lib/srs/session";
import { api, tgInit } from "@/lib/tg-client";

type Grade = 1 | 2 | 3 | 4;
type SessionCard = {
  id: number;
  kind: "recall" | "reverse" | "cloze";
  isNew: boolean;
  word: string;
  translation: string;
  transcription: string | null;
  example: string | null;
  cloze: string | null;
  set: string;
  intervals: Record<Grade, string>;
};
type ReviewResult = { due: string; state: number; intervals: Record<Grade, string> };

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 1, label: "Не згадав" },
  { grade: 2, label: "Важко" },
  { grade: 3, label: "Згадав" },
  { grade: 4, label: "Легко" },
];

// Картки з коротким кроком навчання (хвилини) повертаємо в кінець цієї ж сесії
const REQUEUE_WITHIN_MS = 20 * 60_000;

const primary = "w-full rounded-xl bg-accent py-3.5 text-[16px] font-medium text-accent-fg transition-opacity disabled:opacity-40";

function speak(word: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(word);
  u.lang = "en-US";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export default function Learn() {
  const [queue, setQueue] = useState<SessionCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(new Set()); // прогрес = картки, на які вже відповів хоч раз
  const [turn, setTurn] = useState(0); // кожен показ картки — новий хід (та сама картка може повернутись у черзі)
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(Date.now());

  useEffect(() => {
    tgInit();
    api<{ cards: SessionCard[] }>("/api/cards/session")
      .then((r) => {
        setQueue(r.cards);
        setTotal(r.cards.length);
      })
      .catch((e: Error) =>
        setError(e.message === "unauthorized" ? "Відкрий застосунок через бота в Telegram." : "Не вдалося завантажити картки."),
      );
  }, []);

  const card = queue?.[0] ?? null;

  useEffect(() => {
    shownAt.current = Date.now();
    setRevealed(false);
    setAnswer("");
  }, [turn]);

  const rate = useCallback(
    async (grade: Grade) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        const r = await api<ReviewResult>("/api/cards/review", {
          cardId: card.id,
          rating: grade,
          durationMs: Date.now() - shownAt.current,
        });
        const again = new Date(r.due).getTime() - Date.now() < REQUEUE_WITHIN_MS;
        setQueue((q) => {
          const rest = (q ?? []).slice(1);
          return again ? [...rest, { ...card, isNew: false, intervals: r.intervals }] : rest;
        });
        setSeen((s) => new Set(s).add(card.id));
        setTurn((t) => t + 1);
      } catch (e) {
        // 409 — цей повтор уже зараховано (подвійний тап), просто йдемо далі
        if ((e as Error).message === "http_409") {
          setQueue((q) => (q ?? []).slice(1));
          setTurn((t) => t + 1);
        }
        else setError("Не вдалося зберегти відповідь. Перевір з'єднання і спробуй ще раз.");
      } finally {
        setBusy(false);
      }
    },
    [card, busy],
  );

  // Клавіатура на десктопі: пробіл — показати, 1–4 — оцінка
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card || (e.target as HTMLElement).tagName === "INPUT") return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        rate(Number(e.key) as Grade);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, revealed, rate]);

  const clozeRight = card?.kind === "cloze" && revealed ? clozeMatches(answer, card.word) : null;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pb-10 pt-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-[14px] text-muted hover:text-foreground">← Головна</Link>
          {queue && total > 0 && (
            <span className="font-mono text-xs text-muted">{seen.size} з {total}</span>
          )}
        </div>
        {queue && total > 0 && (
          <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--muted)]/15" role="progressbar" aria-valuenow={seen.size} aria-valuemax={total}>
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(seen.size / total) * 100}%` }} />
          </div>
        )}
      </header>

      {error && <p className="rounded-xl bg-surface px-4 py-3 text-[14px] leading-snug" role="alert">{error}</p>}

      {!queue && !error && <p className="text-[15px] text-muted">Збираю картки…</p>}

      {queue && !card && (
        <section className="flex flex-col gap-4">
          <h1 className="text-[26px] font-semibold leading-tight">{total > 0 ? "На сьогодні все" : "Поки нічого повторювати"}</h1>
          <p className="text-[15px] leading-relaxed text-muted">
            {total > 0
              ? `Пройдено ${total} карток. Наступні повтори прийдуть тоді, коли слова почнуть забуватись — бот нагадає.`
              : "Нові слова на сьогодні вже додані, а повтори ще не настали. Загляни пізніше."}
          </p>
          <Link href="/" className={`${primary} text-center`}>На головну</Link>
        </section>
      )}

      {card && (
        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 rounded-2xl bg-surface px-5 py-6">
            <div className="flex items-center justify-between gap-3 text-xs text-muted">
              <span>{card.set === "it" ? "IT" : card.set === "everyday" ? "Щоденне" : "Моє слово"}</span>
              {card.isNew && <span className="rounded-full bg-accent px-2 py-0.5 text-accent-fg">нове</span>}
            </div>

            {card.kind === "recall" && (
              <div className="flex flex-col gap-1">
                <WordLine card={card} />
                {card.example && <p className="text-[15px] leading-relaxed text-muted">{card.example}</p>}
              </div>
            )}

            {card.kind === "reverse" && (
              <div className="flex flex-col gap-1">
                <p className="text-[13px] text-muted">Як це англійською?</p>
                <p className="text-[26px] font-semibold leading-tight">{card.translation}</p>
              </div>
            )}

            {card.kind === "cloze" && (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-muted">Впиши слово: {card.translation}</p>
                <p className="text-[18px] leading-relaxed">{card.cloze}</p>
                <input
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && answer.trim() && setRevealed(true)}
                  disabled={revealed}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="слово"
                  className="rounded-xl border border-[color:var(--muted)]/30 bg-background px-3 py-2.5 text-[16px] outline-none focus:border-accent"
                />
              </div>
            )}

            {revealed && (
              <div className="flex flex-col gap-1 border-t border-[color:var(--muted)]/15 pt-4">
                {card.kind === "recall" && <p className="text-[20px] font-medium leading-snug">{card.translation}</p>}
                {card.kind === "reverse" && (
                  <>
                    <WordLine card={card} />
                    {card.example && <p className="text-[15px] leading-relaxed text-muted">{card.example}</p>}
                  </>
                )}
                {card.kind === "cloze" && (
                  <>
                    <p className="text-[15px]">{clozeRight ? "Правильно." : `Правильно: ${card.word}`}</p>
                    <WordLine card={card} />
                  </>
                )}
              </div>
            )}
          </div>

          {!revealed ? (
            <button
              type="button"
              className={primary}
              disabled={card.kind === "cloze" && !answer.trim()}
              onClick={() => setRevealed(true)}
            >
              {card.kind === "cloze" ? "Перевірити" : "Показати відповідь"}
            </button>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {GRADES.map(({ grade, label }) => (
                <button
                  key={grade}
                  type="button"
                  disabled={busy}
                  onClick={() => rate(grade)}
                  className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-2.5 transition-opacity disabled:opacity-40 ${
                    (clozeRight === false ? grade === 1 : grade === 3) ? "bg-accent text-accent-fg" : "bg-surface"
                  }`}
                >
                  <span className="text-[14px] font-medium leading-tight">{label}</span>
                  <span className="text-[12px] opacity-70">{card.intervals[grade]}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function WordLine({ card }: { card: SessionCard }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <p className="text-[26px] font-semibold leading-tight">{card.word}</p>
      {card.transcription && <span className="font-mono text-[14px] text-muted">/{card.transcription}/</span>}
      <button type="button" onClick={() => speak(card.word)} className="text-[13px] text-muted underline-offset-2 hover:text-foreground hover:underline">
        вимова
      </button>
    </div>
  );
}
