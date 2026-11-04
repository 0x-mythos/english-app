"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, ChatIcon, SpeakerIcon } from "@/components/icons";
import { CHAT_MAX_CHARS, SCENARIOS, type ChatWord, type Correction, type Scenario, type ScenarioId } from "@/lib/chat/chat";
import { topicLabel } from "@/lib/placement/topics";
import { api, tgInit } from "@/lib/tg-client";

type Msg =
  | { id: number; role: "ai"; text: string; words?: ChatWord[] }
  | { id: number; role: "user"; text: string; corrections?: Correction[] };
type Reply = { reply: string; corrections: Correction[]; words: ChatWord[] };
type WordState = "pending" | "added" | "exists";

// Тон кожного сценарію — свій колір з токенів
const TONES: Record<ScenarioId, string> = {
  interview: "bg-sky/15 text-sky",
  standup: "bg-mint/15 text-mint",
  code_review: "bg-berry/18 text-berry",
  small_talk: "bg-sun/30 text-foreground",
  free: "bg-accent/15 text-accent",
};

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export default function Chat() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false); // старт сесії або очікування відповіді
  const [error, setError] = useState<string | null>(null);
  const [lost, setLost] = useState(false); // сесія зникла (404) — пропонуємо почати знову
  const [limit, setLimit] = useState(false); // денний ліміт вичерпано
  const [wordState, setWordState] = useState<Record<string, WordState>>({});
  const nextId = useRef(1);
  const bottom = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    tgInit();
  }, []);

  // автоскрол до найновішого
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy, error]);

  // textarea росте до ~4 рядків
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [text, scenario]);

  async function start(s: Scenario) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ sessionId: string; opener: string }>("/api/chat/start", { scenario: s.id });
      setScenario(s);
      setSessionId(r.sessionId);
      setMsgs([{ id: nextId.current++, role: "ai", text: r.opener }]);
      setLost(false);
      setLimit(false);
      setText("");
    } catch (e) {
      setError((e as Error).message === "unauthorized" ? "Відкрий застосунок через бота в Telegram." : "Не вдалося почати розмову, спробуй ще раз.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    window.speechSynthesis?.cancel();
    setScenario(null);
    setSessionId(null);
    setMsgs([]);
    setError(null);
    setLost(false);
    setLimit(false);
  }

  async function send() {
    const t = text.trim();
    if (!t || busy || !sessionId) return;
    setBusy(true);
    setError(null);
    // повторна спроба після 502 не дублює бульбашку юзера
    const last = msgs[msgs.length - 1];
    const retry = last?.role === "user" && last.text === t && !last.corrections;
    const userId = retry ? last.id : nextId.current++;
    if (!retry) setMsgs((m) => [...m, { id: userId, role: "user", text: t }]);
    setText("");
    try {
      const r = await api<Reply>("/api/chat/message", { sessionId, text: t });
      setMsgs((m) => [
        ...m.map((x) => (x.id === userId && x.role === "user" ? { ...x, corrections: r.corrections } : x)),
        { id: nextId.current++, role: "ai", text: r.reply, words: r.words },
      ]);
    } catch (e) {
      const code = (e as Error).message;
      if (code === "http_404") {
        setLost(true);
        setError("Розмова загубилась. Почни її знову.");
      } else {
        setText(t); // повернути текст, щоб можна було надіслати ще раз
        if (code === "http_429") setLimit(true);
        setError(
          code === "http_429"
            ? "На сьогодні ліміт розмов вичерпано, повертайся завтра."
            : code === "http_502"
              ? "AI зараз не відповів. Надішли ще раз."
              : code === "unauthorized"
                ? "Відкрий застосунок через бота в Telegram."
                : "Не вийшло надіслати, перевір з'єднання і спробуй ще раз.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function addWord(key: string, w: ChatWord) {
    if (wordState[key]) return;
    setWordState((s) => ({ ...s, [key]: "pending" }));
    try {
      const r = await api<{ status: "added" | "exists" }>("/api/cards/word", {
        word: w.word,
        translation: w.translation,
        transcription: w.transcription,
        example: w.example,
      });
      setWordState((s) => ({ ...s, [key]: r.status }));
    } catch {
      setWordState((s) => {
        const rest = { ...s };
        delete rest[key];
        return rest;
      });
      setError("Не вдалося додати слово в картки.");
    }
  }

  // ---------- Крок 1: вибір сценарію ----------
  if (!scenario) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-10 pt-5">
        <header className="flex flex-col gap-3">
          <Link href="/" className="flex items-center gap-1.5 self-start text-[15px] font-semibold text-muted hover:text-foreground">
            <ArrowLeftIcon className="size-4" /> Головна
          </Link>
          <h1 className="font-display text-[30px] font-semibold leading-[1.1] tracking-tight">Розмова з AI</h1>
          <p className="text-[15px] leading-relaxed text-muted">Обери ситуацію й пиши англійською. AI відповість і м&apos;яко виправить 1–2 помилки.</p>
        </header>
        <div className="flex flex-col gap-2.5">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={busy}
              onClick={() => start(s)}
              className="pop-in flex items-start gap-3.5 rounded-2xl bg-surface px-4 py-4 text-left shadow-card transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
            >
              <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${TONES[s.id]}`}>
                <ChatIcon className="size-6" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[16px] font-bold">{s.title}</span>
                <span className="text-[14px] leading-snug text-muted">{s.note}</span>
              </span>
            </button>
          ))}
        </div>
        {busy && <p className="text-[13px] text-muted">Починаємо…</p>}
        {error && <p className="text-[14px] text-accent">{error}</p>}
      </main>
    );
  }

  // ---------- Крок 2: розмова ----------
  return (
    <main className="mx-auto flex max-w-md flex-col px-4 pb-32 pt-0">
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${TONES[scenario.id]}`}>
            <ChatIcon className="size-5" />
          </span>
          <h1 className="truncate font-display text-[18px] font-semibold">{scenario.title}</h1>
        </div>
        <button
          type="button"
          onClick={reset}
          className="shrink-0 rounded-full bg-surface px-3.5 py-1.5 text-[13px] font-semibold shadow-card transition-transform active:scale-[0.97]"
        >
          Нова розмова
        </button>
      </header>

      <div className="flex flex-col gap-3 pt-2">
        {msgs.map((m) =>
          m.role === "ai" ? (
            <div key={m.id} className="pop-in flex max-w-[88%] flex-col items-start gap-1.5 self-start">
              <div className="flex items-start gap-1.5 rounded-2xl rounded-tl-md bg-surface px-3.5 py-2.5 shadow-card">
                <p className="whitespace-pre-wrap text-[16px] leading-snug">{m.text}</p>
                <button
                  type="button"
                  onClick={() => speak(m.text)}
                  aria-label="Озвучити"
                  className="mt-0.5 shrink-0 text-muted hover:text-foreground"
                >
                  <SpeakerIcon className="size-4" />
                </button>
              </div>
              {m.words && m.words.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {m.words.map((w) => {
                    const key = `${m.id}:${w.word}`;
                    const st = wordState[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={!!st}
                        onClick={() => addWord(key, w)}
                        className={`rounded-full px-3 py-1 text-left text-[13px] font-medium transition-opacity ${
                          st === "added" || st === "exists" ? "bg-mint/20 text-mint" : "bg-berry/18 text-berry"
                        } ${st === "pending" ? "opacity-50" : ""}`}
                      >
                        {st === "added" ? `✓ в картках — ${w.word}` : st === "exists" ? `вже є — ${w.word}` : `+ ${w.word} — ${w.translation}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div key={m.id} className="pop-in flex max-w-[88%] flex-col items-end gap-1.5 self-end">
              <p className="whitespace-pre-wrap rounded-2xl rounded-tr-md bg-sky px-3.5 py-2.5 text-[16px] leading-snug text-white">{m.text}</p>
              {m.corrections &&
                (m.corrections.length === 0 ? (
                  <span className="px-1 text-[12px] font-medium text-mint">✓ без помилок</span>
                ) : (
                  <div className="flex flex-col gap-2 self-stretch rounded-2xl bg-accent/10 px-3.5 py-2.5">
                    {m.corrections.map((c, i) => (
                      <div key={i} className="flex flex-col gap-0.5 text-[14px] leading-snug">
                        <span>
                          <s className="text-muted">{c.original}</s> → <b className="font-semibold">{c.corrected}</b>
                        </span>
                        <span className="text-muted">{c.explanation}</span>
                        <span className="self-start rounded-full bg-accent/15 px-2.5 py-0.5 text-[12px] font-semibold text-accent">
                          {topicLabel(c.topic)}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          ),
        )}

        {busy && (
          <div className="pop-in flex items-center gap-1 self-start rounded-2xl rounded-tl-md bg-surface px-4 py-3.5 shadow-card" aria-label="AI друкує">
            {[0, 150, 300].map((d) => (
              <i key={d} className="size-2 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        )}

        {error && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-[14px] text-accent">{error}</p>
            {lost && (
              <button type="button" onClick={() => start(scenario)} className="rounded-full bg-sky px-4 py-2 text-[14px] font-semibold text-white">
                Почати знову
              </button>
            )}
          </div>
        )}
        {/* scroll-mb: щоб scrollIntoView не ховав останнє під закріпленим полем вводу */}
        <div ref={bottom} className="scroll-mb-28" />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 bg-background/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-md items-end gap-2 px-4 pb-3 pt-2">
          <textarea
            ref={area}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Напиши англійською…"
            maxLength={CHAT_MAX_CHARS}
            rows={1}
            disabled={busy || lost || limit}
            autoCapitalize="sentences"
            enterKeyHint="send"
            aria-label="Повідомлення"
            className="min-w-0 flex-1 resize-none rounded-2xl bg-surface px-3.5 py-2.5 text-[16px] leading-snug outline-none ring-1 ring-line placeholder:text-muted/70 focus:ring-2 focus:ring-sky disabled:opacity-50"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || lost || limit || !text.trim()}
            aria-label="Надіслати"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sky text-white transition-opacity disabled:opacity-40"
          >
            <ArrowLeftIcon className="size-5 rotate-90" />
          </button>
        </div>
      </div>
    </main>
  );
}
