"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, BookIcon } from "@/components/icons";
import { WordPanel, type Lookup } from "@/components/word-panel";
import { sentenceAt } from "@/lib/reading/sentence";
import { tokenize } from "@/lib/reading/tokenize";
import { api, tgInit } from "@/lib/tg-client";

type Item = { id: string; title: string; level: string; topic: string; words: number };
type View = { id: string; title: string; level: string; topic: string; text: string; questions: { prompt: string; options: string[] }[] };
type Graded = { correct: number; total: number; results: { correct: boolean; answer: number; explanation: string }[] };

const TOPICS: Record<string, string> = {
  code_review: "Рев'ю коду", api: "API", devops: "DevOps", meetings: "Зустрічі", interview: "Співбесіда",
  data: "Дані", general_it: "IT", everyday: "Повсякденне",
};

const READ_KEY = (id: string) => `read:${id}`;
const isRead = (id: string) => {
  try {
    return localStorage.getItem(READ_KEY(id)) === "1";
  } catch {
    return false;
  }
};
const setRead = (id: string, v: boolean) => {
  try {
    if (v) localStorage.setItem(READ_KEY(id), "1");
    else localStorage.removeItem(READ_KEY(id));
  } catch {
    // сховище недоступне — позначка просто не збережеться
  }
};

const errText = (e: Error) => (e.message === "unauthorized" ? "Відкрий застосунок через бота в Telegram." : "Не вдалося завантажити. Спробуй ще раз.");

export default function Read() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    tgInit();
    api<{ texts: Item[] }>("/api/reading/list")
      .then((r) => {
        setItems(r.texts);
        setReadIds(new Set(r.texts.filter((t) => isRead(t.id)).map((t) => t.id)));
      })
      .catch((e: Error) => setError(errText(e)));
  }, []);

  function open(id: string) {
    setError(null);
    api<View>(`/api/reading/text?id=${encodeURIComponent(id)}`)
      .then((v) => {
        setView(v);
        window.scrollTo(0, 0);
      })
      .catch((e: Error) => setError(errText(e)));
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-10 pt-5">
      <header className="flex items-center justify-between gap-3">
        {view ? (
          <button type="button" onClick={() => setView(null)} className="flex items-center gap-1.5 text-[15px] font-semibold text-muted hover:text-foreground">
            <ArrowLeftIcon className="size-4" /> Тексти
          </button>
        ) : (
          <Link href="/" className="flex items-center gap-1.5 text-[15px] font-semibold text-muted hover:text-foreground">
            <ArrowLeftIcon className="size-4" /> Головна
          </Link>
        )}
      </header>

      {error && <p className="rounded-2xl bg-accent/12 px-4 py-3 text-[14px] font-medium leading-snug text-accent" role="alert">{error}</p>}

      {!view && (
        <>
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">Читання</h1>
          {!items && !error && <div className="h-40 animate-pulse rounded-[28px] bg-line" />}
          {items && items.length === 0 && <p className="text-[15px] text-muted">Текстів поки немає.</p>}
          <div className="flex flex-col gap-2.5">
            {items?.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => open(t.id)}
                className="flex items-start gap-3.5 rounded-2xl bg-surface px-4 py-4 text-left shadow-card transition-transform active:scale-[0.99]"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-mint/20 text-mint">
                  <BookIcon className="size-6" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[16px] font-bold leading-snug">{t.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                    <span className="rounded-full bg-mint/20 px-2.5 py-0.5 font-semibold text-mint">{t.level}</span>
                    <span>{TOPICS[t.topic] ?? t.topic}</span>
                    <span>· {t.words} слів</span>
                    {readIds.has(t.id) && <span className="font-semibold text-mint">· Прочитано</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {view && (
        <Reader
          key={view.id}
          view={view}
          read={readIds.has(view.id)}
          onToggleRead={() => {
            const v = !readIds.has(view.id);
            setRead(view.id, v);
            setReadIds((s) => {
              const n = new Set(s);
              if (v) n.add(view.id);
              else n.delete(view.id);
              return n;
            });
          }}
        />
      )}
    </main>
  );
}

type Sel = { word: string; sentence: string; start: number };

function Reader({ view, read, onToggleRead }: { view: View; read: boolean; onToggleRead: () => void }) {
  const paragraphs = useMemo(() => {
    const out: { tokens: ReturnType<typeof tokenize> }[] = [];
    let offset = 0;
    for (const p of view.text.split(/(\n\n+)/)) {
      if (!/^\n+$/.test(p)) out.push({ tokens: tokenize(p).map((t) => ({ ...t, start: t.start + offset })) });
      offset += p.length;
    }
    return out;
  }, [view.text]);

  const [sel, setSel] = useState<Sel | null>(null);
  const [lookup, setLookup] = useState<Lookup>({ status: "loading" });
  const cache = useRef(new Map<string, Lookup>());
  const wordEl = useRef<HTMLElement | null>(null);
  const panelEl = useRef<HTMLDivElement | null>(null);

  const tap = useCallback(
    (el: HTMLElement, word: string, start: number) => {
      wordEl.current = el;
      setSel({ word, start, sentence: sentenceAt(view.text, start) });
      const key = word.toLowerCase();
      const hit = cache.current.get(key);
      if (hit) return setLookup(hit);
      setLookup({ status: "loading" });
      api<Lookup>(`/api/reading/lookup?w=${encodeURIComponent(word)}&id=${encodeURIComponent(view.id)}`)
        .then((r) => {
          cache.current.set(key, r);
          setLookup((cur) => (wordEl.current === el ? r : cur));
        })
        .catch(() => setLookup((cur) => (wordEl.current === el ? { status: "error" } : cur)));
    },
    [view.text, view.id],
  );

  // панель не має перекривати натиснуте слово: підсуваємо сторінку, щоб слово було над панеллю
  useLayoutEffect(() => {
    const el = wordEl.current;
    const panel = panelEl.current;
    if (!sel || !el || !panel) return;
    const limit = window.innerHeight - panel.offsetHeight - 16;
    const r = el.getBoundingClientRect();
    if (r.bottom > limit) window.scrollBy({ top: r.bottom - limit, behavior: "smooth" });
    else if (r.top < 64) window.scrollBy({ top: r.top - 64, behavior: "smooth" });
  }, [sel, lookup]);

  return (
    <>
      <article className="flex flex-col gap-1">
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight">{view.title}</h1>
        <p className="mb-2 text-[13px] text-muted">{view.level} · {TOPICS[view.topic] ?? view.topic}. Торкнись слова — побачиш переклад.</p>
        {paragraphs.map((p, i) => (
          <p key={i} className="mb-3 text-[18px] leading-8">
            {p.tokens.map((t) =>
              t.word ? (
                <button
                  key={t.start}
                  type="button"
                  onClick={(e) => tap(e.currentTarget, t.text, t.start)}
                  className={`inline-block h-8 rounded-md px-0.5 align-baseline leading-8 transition-colors ${
                    sel?.start === t.start
                      ? "bg-mint/30"
                      : "hover:bg-mint/15"
                  }`}
                >
                  {t.text}
                </button>
              ) : (
                <span key={t.start}>{t.text}</span>
              ),
            )}
          </p>
        ))}
      </article>

      <Questions view={view} />

      <button
        type="button"
        onClick={onToggleRead}
        className={`w-full rounded-2xl py-3.5 text-[16px] font-bold shadow-card transition-transform active:scale-[0.99] ${
          read ? "bg-mint/20 text-mint" : "bg-mint text-ink"
        }`}
      >
        {read ? "Прочитано ✓" : "Прочитано"}
      </button>

      {/* місце під панель, щоб останні рядки не ховались */}
      {sel && <div className="h-64" aria-hidden />}
      {sel && (
        <WordPanel
          key={`${sel.word}:${sel.sentence}`}
          ref={panelEl}
          word={sel.word}
          sentence={sel.sentence}
          textId={view.id}
          lookup={lookup}
          onClose={() => {
            setSel(null);
            wordEl.current = null;
          }}
          onAdded={() => cache.current.clear()}
        />
      )}
    </>
  );
}

function Questions({ view }: { view: View }) {
  const [picked, setPicked] = useState<(number | null)[]>(() => view.questions.map(() => null));
  const [graded, setGraded] = useState<Graded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = picked.every((p) => p !== null);

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      setGraded(await api<Graded>("/api/reading/answer", { id: view.id, answers: picked }));
    } catch {
      setError("Не вдалося перевірити. Перевір з'єднання і відправ ще раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 pt-2">
      <h2 className="font-display text-[18px] font-semibold">Чи зрозуміла суть?</h2>
      {view.questions.map((q, qi) => (
        <div key={qi} className="flex flex-col gap-2 rounded-2xl bg-surface px-4 py-4 shadow-card">
          <p className="text-[16px] font-semibold leading-snug">{q.prompt}</p>
          <div className="flex flex-col gap-2">
            {q.options.map((o, oi) => {
              const r = graded?.results[qi];
              const isAnswer = r?.answer === oi;
              const wrongPick = r && picked[qi] === oi && !r.correct;
              return (
                <button
                  key={oi}
                  type="button"
                  disabled={!!graded}
                  onClick={() => setPicked((p) => p.map((x, i) => (i === qi ? oi : x)))}
                  className={`rounded-xl px-3.5 py-3 text-left text-[15px] leading-snug ring-1 transition-colors ${
                    isAnswer ? "bg-mint/20 ring-mint" : wrongPick ? "bg-accent/12 ring-accent" : picked[qi] === oi ? "bg-mint/15 ring-mint" : "bg-background ring-line"
                  }`}
                >
                  {o}
                </button>
              );
            })}
          </div>
          {graded && <p className="text-[14px] leading-snug text-muted">{graded.results[qi].explanation}</p>}
        </div>
      ))}
      {graded ? (
        <p className="rounded-2xl bg-mint/20 px-4 py-3 text-[15px] font-semibold text-mint">
          Правильно: {graded.correct} з {graded.total}
        </p>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={!ready || busy}
          className="w-full rounded-2xl bg-ink py-3.5 text-[16px] font-bold text-background shadow-card disabled:opacity-40"
        >
          {busy ? "…" : "Перевірити"}
        </button>
      )}
      {error && <p className="text-[14px] font-medium text-accent" role="alert">{error}</p>}
    </section>
  );
}
