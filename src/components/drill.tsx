"use client";

import { useEffect, useState } from "react";
import type { DrillView } from "@/lib/grammar/drills";
import { api } from "@/lib/tg-client";

type Result = { correct: boolean; expected: string; explanation: string | null };

const primary =
  "w-full rounded-2xl bg-berry py-4 text-[17px] font-bold text-white shadow-card transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40";

const TASK: Record<DrillView["type"], string> = {
  choice: "Обери варіант",
  gap: "Впиши правильну форму",
  fix: "Знайди й виправ помилку",
  own: "Твоє речення — виправ помилку",
};

/** Одна граматична вправа: відповідь → перевірка на сервері → пояснення → «Далі». */
export function Drill({ drill, onDone }: { drill: DrillView; onDone: (correct: boolean) => void }) {
  const editable = drill.type === "fix" || drill.type === "own";
  const [answer, setAnswer] = useState(editable ? drill.prompt : "");
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);

  const canCheck = drill.type === "choice" ? false : answer.trim().length > 0 && (!editable || answer.trim() !== drill.prompt.trim());

  async function check(value: string, accept = false) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<Result>("/api/grammar/answer", { id: drill.id, answer: value, accept });
      if (accept) setAccepted(true);
      else setResult(r);
    } catch {
      setError("Не вдалося перевірити. Перевір з'єднання і спробуй ще раз.");
    } finally {
      setBusy(false);
    }
  }

  const done = result !== null;
  const ok = !!result && (result.correct || accepted);

  // Enter після перевірки — далі (на десктопі)
  useEffect(() => {
    if (!done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onDone(ok);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, ok, onDone]);

  return (
    <section className="pop-in flex flex-col gap-4">
      <div className="overflow-hidden rounded-[28px] bg-surface shadow-card">
        <div className="flex items-center justify-between gap-3 bg-berry px-5 py-2.5 text-[13px] font-bold text-white">
          <span>Граматика · {drill.title}</span>
          {drill.type === "own" && <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[12px] text-ink">твоя помилка</span>}
        </div>

        <div className="flex flex-col gap-4 px-5 pb-6 pt-5">
          <p className="text-[14px] font-semibold text-muted">{TASK[drill.type]}</p>

          {!editable && <Prompt text={drill.prompt} fill={done ? (drill.type === "choice" ? drill.options![picked!] : answer) : null} ok={ok} />}

          {drill.type === "choice" && (
            <div className="flex flex-col gap-2">
              {drill.options!.map((o, i) => {
                const mine = picked === i;
                const right = done && o === result.expected;
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={done || busy}
                    onClick={() => {
                      setPicked(i);
                      check(String(i));
                    }}
                    className={`rounded-2xl border-2 px-4 py-3 text-left text-[16px] font-semibold transition-[transform,colors] active:scale-[0.99] ${
                      right ? "border-mint bg-mint/15" : mine && done ? "border-accent bg-accent/10" : mine ? "border-berry" : "border-line bg-background"
                    }`}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          )}

          {drill.type !== "choice" && (
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canCheck && !done) check(answer);
                }
              }}
              disabled={done}
              rows={editable ? 3 : 1}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={drill.type === "gap" ? "відповідь" : ""}
              className={`resize-none rounded-2xl border-2 bg-background px-4 py-3 text-[17px] font-medium leading-snug outline-none transition-colors focus:border-berry ${
                done ? (ok ? "border-mint" : "border-accent") : "border-line"
              }`}
            />
          )}

          {done && (
            <div className="pop-in flex flex-col gap-2 rounded-2xl bg-background px-4 py-3.5">
              <p className={`text-[15px] font-bold ${ok ? "text-mint" : "text-accent"}`}>
                {result.correct ? "Правильно!" : accepted ? "Зараховано" : "Правильно так:"}
              </p>
              {!result.correct && <p className="text-[17px] font-semibold leading-snug">{result.expected}</p>}
              {result.explanation && <p className="text-[15px] leading-relaxed text-muted">{result.explanation}</p>}
              {!result.correct && !accepted && drill.type !== "choice" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => check(answer, true)}
                  className="self-start pt-1 text-[14px] font-semibold text-muted underline underline-offset-4 hover:text-foreground"
                >
                  Моя відповідь теж правильна
                </button>
              )}
            </div>
          )}

          {drill.rule && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setRuleOpen((v) => !v)}
                className="self-start text-[14px] font-semibold text-berry"
                aria-expanded={ruleOpen}
              >
                {ruleOpen ? "Сховати правило" : "Правило теми"}
              </button>
              {ruleOpen && <p className="rounded-2xl bg-berry/10 px-4 py-3 text-[15px] leading-relaxed">{drill.rule}</p>}
            </div>
          )}
        </div>
      </div>

      {error && <p className="rounded-2xl bg-accent/12 px-4 py-3 text-[14px] font-medium leading-snug text-accent" role="alert">{error}</p>}

      {done ? (
        <button type="button" className={primary} onClick={() => onDone(ok)}>Далі</button>
      ) : (
        drill.type !== "choice" && (
          <button type="button" className={primary} disabled={!canCheck || busy} onClick={() => check(answer)}>Перевірити</button>
        )
      )}
    </section>
  );
}

/** Речення з пропуском: до перевірки — порожня риска, після — вписана відповідь кольором результату. */
function Prompt({ text, fill, ok }: { text: string; fill: string | null; ok: boolean }) {
  const [before, after] = text.split("___");
  return (
    <p className="text-[19px] font-medium leading-relaxed">
      {before}
      {fill === null ? (
        <span className="inline-block min-w-16 border-b-2 border-berry align-baseline">&nbsp;</span>
      ) : (
        <span className={`rounded-md px-1 font-bold ${ok ? "bg-mint/20 text-mint" : "bg-accent/12 text-accent"}`}>{fill}</span>
      )}
      {after}
    </p>
  );
}
