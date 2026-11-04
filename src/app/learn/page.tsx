"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, SparkIcon, SpeakerIcon } from "@/components/icons";
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

// Кольори оцінок: порада (Згадав, або Не згадав після хибної відповіді) — суцільна, решта — тоновані
const GRADES: { grade: Grade; label: string; tone: string; solid: string }[] = [
  { grade: 1, label: "Не згадав", tone: "bg-accent/15 text-accent", solid: "bg-accent text-white" },
  { grade: 2, label: "Важко", tone: "bg-sun/25 text-foreground", solid: "bg-sun text-ink" },
  { grade: 3, label: "Згадав", tone: "bg-mint/20 text-mint", solid: "bg-mint text-white" },
  { grade: 4, label: "Легко", tone: "bg-sky/20 text-sky", solid: "bg-sky text-white" },
];

const SET_TONE: Record<string, string> = {
  it: "bg-sky text-white",
  everyday: "bg-sun text-ink",
  own: "bg-berry text-white",
};

// Картки з коротким кроком навчання (хвилини) повертаємо в кінець цієї ж сесії
const REQUEUE_WITHIN_MS = 20 * 60_000;

const primary =
  "w-full rounded-2xl bg-accent py-4 text-[17px] font-bold text-accent-fg shadow-card transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40";

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
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-10 pt-5">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-[15px] font-semibold text-muted hover:text-foreground">
            <ArrowLeftIcon className="size-4" /> Головна
          </Link>
          {queue && total > 0 && (
            <span className="rounded-full bg-surface px-3 py-1 font-display text-[13px] font-semibold shadow-card">
              {seen.size}<span className="text-muted"> / {total}</span>
            </span>
          )}
        </div>
        {queue && total > 0 && (
          <div className="h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={seen.size} aria-valuemax={total}>
            <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${(seen.size / total) * 100}%` }} />
          </div>
        )}
      </header>

      {error && <p className="rounded-2xl bg-accent/12 px-4 py-3 text-[14px] font-medium leading-snug text-accent" role="alert">{error}</p>}

      {!queue && !error && <div className="h-64 animate-pulse rounded-[28px] bg-line" />}

      {queue && !card && (
        <section className="pop-in flex flex-col items-start gap-4 rounded-[28px] bg-mint px-6 pb-6 pt-8 text-white shadow-card">
          <SparkIcon className="size-10" />
          <h1 className="font-display text-[28px] font-semibold leading-tight">{total > 0 ? "На сьогодні все!" : "Поки нічого повторювати"}</h1>
          <p className="text-[16px] leading-relaxed opacity-95">
            {total > 0
              ? `${total} ${plural(total, "картка", "картки", "карток")} пройдено. Наступні повтори прийдуть тоді, коли слова почнуть забуватись — бот нагадає.`
              : "Нові слова на сьогодні вже додані, а повтори ще не настали. Загляни пізніше."}
          </p>
          <Link href="/" className="mt-1 rounded-full bg-white px-5 py-2.5 text-[15px] font-semibold text-mint">На головну</Link>
        </section>
      )}

      {card && (
        <section key={turn} className="pop-in flex flex-col gap-4">
          <div className="overflow-hidden rounded-[28px] bg-surface shadow-card">
            <div className={`flex items-center justify-between gap-3 px-5 py-2.5 text-[13px] font-bold ${SET_TONE[card.set] ?? SET_TONE.own}`}>
              <span>{card.set === "it" ? "IT English" : card.set === "everyday" ? "Щоденна англійська" : "Моє слово"}</span>
              {card.isNew && <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[12px] text-ink">нове</span>}
            </div>

            <div className="flex flex-col gap-4 px-5 pb-6 pt-5">
              {card.kind === "recall" && (
                <div className="flex flex-col gap-3">
                  <WordLine card={card} />
                  {card.example && <p className="text-[16px] leading-relaxed text-muted">{card.example}</p>}
                </div>
              )}

              {card.kind === "reverse" && (
                <div className="flex flex-col gap-2">
                  <p className="text-[14px] font-semibold text-muted">Як це англійською?</p>
                  <p className="font-display text-[26px] font-semibold leading-tight">{card.translation}</p>
                </div>
              )}

              {card.kind === "cloze" && (
                <div className="flex flex-col gap-3">
                  <p className="text-[14px] font-semibold text-muted">Впиши слово: <span className="text-foreground">{card.translation}</span></p>
                  <p className="text-[19px] font-medium leading-relaxed">{card.cloze}</p>
                  <input
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && answer.trim() && setRevealed(true)}
                    disabled={revealed}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="слово"
                    className={`rounded-2xl border-2 bg-background px-4 py-3 text-[17px] font-semibold outline-none transition-colors focus:border-accent ${
                      clozeRight === true ? "border-mint" : clozeRight === false ? "border-accent" : "border-line"
                    }`}
                  />
                </div>
              )}

              {revealed && (
                <div className="pop-in flex flex-col gap-2 rounded-2xl bg-background px-4 py-3.5">
                  {card.kind === "recall" && <p className="font-display text-[21px] font-semibold leading-snug">{card.translation}</p>}
                  {card.kind === "reverse" && (
                    <>
                      <WordLine card={card} />
                      {card.example && <p className="text-[15px] leading-relaxed text-muted">{card.example}</p>}
                    </>
                  )}
                  {card.kind === "cloze" && (
                    <>
                      <p className={`text-[15px] font-bold ${clozeRight ? "text-mint" : "text-accent"}`}>
                        {clozeRight ? "Правильно!" : `Правильно: ${card.word}`}
                      </p>
                      <WordLine card={card} />
                    </>
                  )}
                </div>
              )}
            </div>
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
              {GRADES.map(({ grade, label, tone, solid }) => {
                const suggested = clozeRight === false ? grade === 1 : grade === 3;
                return (
                  <button
                    key={grade}
                    type="button"
                    disabled={busy}
                    onClick={() => rate(grade)}
                    className={`flex flex-col items-center gap-0.5 rounded-2xl px-1 py-3 transition-[transform,opacity] active:scale-95 disabled:opacity-40 ${
                      suggested ? `${solid} shadow-card` : tone
                    }`}
                  >
                    <span className="text-[14px] font-bold leading-tight">{label}</span>
                    <span className="text-[12px] font-semibold opacity-75">{card.intervals[grade]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function WordLine({ card }: { card: SessionCard }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <p className="font-display text-[34px] font-semibold leading-[1.05] tracking-tight [overflow-wrap:anywhere]">{card.word}</p>
        <button
          type="button"
          onClick={() => speak(card.word)}
          aria-label="Вимова"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky/15 text-sky transition-transform active:scale-90"
        >
          <SpeakerIcon className="size-5" />
        </button>
      </div>
      {card.transcription && <span className="font-mono text-[14px] text-muted">/{card.transcription}/</span>}
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
