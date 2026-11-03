"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, tgInit } from "@/lib/tg-client";
import { topicLabel } from "@/lib/placement/topics";
import { WRITING_MAX_CHARS, WRITING_MIN_CHARS, WRITING_TASK } from "@/lib/placement/writing";

type Step = "goals" | "vocab" | "grammar" | "reading" | "writing" | "checking" | "result";
type Question = { id: string; topic: string; prompt: string; options: string[] };
type Reading = { level: "B1" | "B2"; title: string; text: string; questions: { prompt: string; options: string[] }[] };
type GrammarReply = { done: false; question: Question; index: number; total: number } | { done: true; reading: Reading };
type Result = {
  vocab: { size: number; cefr: string };
  grammar: { level: string; correct: number; total: number; weakTopics: { topic: string; score: number }[] };
  reading: { level: string; correct: number; total: number };
  writing: { level: string; errors: { original: string; corrected: string; explanation: string; topic: string }[] } | null;
};

const STEPS: Step[] = ["goals", "vocab", "grammar", "reading", "writing"];
const STEP_TITLES: Record<Step, string> = {
  goals: "Цілі",
  vocab: "Словник",
  grammar: "Граматика",
  reading: "Читання",
  writing: "Письмо",
  checking: "Перевірка",
  result: "Результат",
};
const GOALS = [
  { id: "it", label: "IT-англійська" },
  { id: "everyday", label: "Повсякденна" },
];
const MINUTES = [5, 10, 15, 20, 30];
const VOCAB_PAGE = 25;

const chip = (on: boolean) =>
  `rounded-full border px-4 py-2 text-[15px] transition-colors ${
    on ? "border-accent bg-accent text-accent-fg" : "border-[color:var(--muted)]/30 bg-surface hover:border-accent"
  }`;
const option = (on: boolean) =>
  `w-full rounded-xl border px-4 py-3 text-left text-[15px] leading-snug transition-colors disabled:opacity-60 ${
    on ? "border-accent bg-accent text-accent-fg" : "border-[color:var(--muted)]/25 bg-surface hover:border-accent"
  }`;
const primary = "w-full rounded-xl bg-accent py-3.5 text-[16px] font-medium text-accent-fg transition-opacity disabled:opacity-40";

export default function PlacementTest() {
  const [step, setStep] = useState<Step>("goals");
  const [error, setError] = useState<string | null>(null);

  const [goals, setGoals] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(10);

  const [words, setWords] = useState<{ id: string; word: string }[]>([]);
  const [known, setKnown] = useState<Record<string, boolean>>({});
  const [vocabPage, setVocabPage] = useState(0);

  const [history, setHistory] = useState<{ id: string; choice: number }[]>([]);
  const [question, setQuestion] = useState<{ q: Question; index: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const [reading, setReading] = useState<Reading | null>(null);
  const [readingAnswers, setReadingAnswers] = useState<(number | undefined)[]>([]);

  const [writing, setWriting] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    tgInit();
    api<{ items: { id: string; word: string }[] }>("/api/placement/vocab")
      .then((r) => setWords(r.items))
      .catch(() => setError("Не вдалося завантажити тест. Спробуй пізніше."));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step, vocabPage]);

  const fail = (e: unknown) =>
    setError(e instanceof Error && e.message === "unauthorized" ? "Відкрий застосунок через бота в Telegram." : "Сервер не відповів, спробуй ще раз.");

  async function loadGrammar(h: typeof history) {
    setBusy(true);
    try {
      const r = await api<GrammarReply>("/api/placement/grammar", { history: h });
      if (r.done) {
        setReading(r.reading);
        setStep("reading");
      } else {
        setQuestion({ q: r.question, index: r.index, total: r.total });
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function answerGrammar(choice: number) {
    if (!question || busy) return;
    const h = [...history, { id: question.q.id, choice }];
    setHistory(h);
    void loadGrammar(h);
  }

  async function submit() {
    setStep("checking");
    try {
      const r = await api<Result>("/api/placement/submit", {
        goals,
        minutesPerDay: minutes,
        vocab: known,
        grammar: history,
        reading: readingAnswers,
        writing,
      });
      setResult(r);
      setStep("result");
    } catch (e) {
      setStep("writing");
      fail(e);
    }
  }

  // Прогрес: крок + частка всередині кроку
  const stepIdx = STEPS.indexOf(step);
  const inner =
    step === "vocab" ? vocabPage / 2 : step === "grammar" && question ? question.index / question.total : 0;
  const progress = step === "checking" || step === "result" ? 1 : (stepIdx + inner) / STEPS.length;

  const vocabSlice = words.slice(vocabPage * VOCAB_PAGE, (vocabPage + 1) * VOCAB_PAGE);
  const writingLen = writing.trim().length;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pb-10 pt-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-[14px] text-muted hover:text-foreground">
            ← На головну
          </Link>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted">{STEP_TITLES[step]}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--muted)]/15" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
        </div>
      </header>

      {error && (
        <p className="rounded-xl bg-surface px-4 py-3 text-[14px] leading-snug" role="alert">
          {error}
        </p>
      )}

      {step === "goals" && (
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[26px] font-semibold leading-tight">Тест рівня</h1>
            <p className="text-[15px] leading-relaxed text-muted">
              10–15 хвилин. Окремо міряємо словник, граматику, читання і письмо — так видно, що підтягувати насамперед.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="text-[16px] font-medium">Яка англійська потрібна?</h2>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => {
                const on = goals.includes(g.id);
                return (
                  <button key={g.id} type="button" aria-pressed={on} className={chip(on)}
                    onClick={() => setGoals(on ? goals.filter((x) => x !== g.id) : [...goals, g.id])}>
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="text-[16px] font-medium">Скільки хвилин на день?</h2>
            <div className="flex flex-wrap gap-2">
              {MINUTES.map((m) => (
                <button key={m} type="button" aria-pressed={minutes === m} className={chip(minutes === m)} onClick={() => setMinutes(m)}>
                  {m} хв
                </button>
              ))}
            </div>
          </div>
          <button type="button" className={primary} disabled={goals.length === 0 || words.length === 0} onClick={() => setStep("vocab")}>
            Почати
          </button>
        </section>
      )}

      {step === "vocab" && (
        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-[22px] font-semibold leading-tight">Які слова ти знаєш?</h1>
            <p className="text-[15px] leading-relaxed text-muted">
              Познач лише ті, значення яких точно можеш пояснити. Частина слів вигадана — за них знімаються бали, тож не вгадуй.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {vocabSlice.map((w) => {
              const on = !!known[w.id];
              return (
                <button key={w.id} type="button" aria-pressed={on} className={chip(on)} onClick={() => setKnown({ ...known, [w.id]: !on })}>
                  {w.word}
                </button>
              );
            })}
          </div>
          <p className="text-[14px] text-muted">
            Позначено: {vocabSlice.filter((w) => known[w.id]).length} з {vocabSlice.length}
          </p>
          <button
            type="button"
            className={primary}
            onClick={() => {
              if ((vocabPage + 1) * VOCAB_PAGE < words.length) setVocabPage(vocabPage + 1);
              else {
                setStep("grammar");
                void loadGrammar([]);
              }
            }}
          >
            Далі
          </button>
        </section>
      )}

      {step === "grammar" && (
        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-[14px] text-muted">
              {question ? `Питання ${question.index + 1} з ${question.total}` : " "} · питання підлаштовуються під твої відповіді
            </p>
            <h1 className="min-h-[3.5rem] text-[21px] font-medium leading-snug">
              {question ? <Blank text={question.q.prompt} /> : "Завантаження…"}
            </h1>
          </div>
          <div className="flex flex-col gap-2">
            {question?.q.options.map((o, i) => (
              <button key={`${question.q.id}-${i}`} type="button" className={option(false)} disabled={busy} onClick={() => answerGrammar(i)}>
                {o}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "reading" && reading && (
        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-[22px] font-semibold leading-tight">Прочитай і дай відповідь</h1>
            <p className="text-[15px] text-muted">Текст можна перечитувати скільки завгодно.</p>
          </div>
          <article className="flex flex-col gap-2 rounded-2xl bg-surface px-4 py-4">
            <h2 className="text-[17px] font-medium" lang="en">{reading.title}</h2>
            <p className="text-[15px] leading-relaxed" lang="en">{reading.text}</p>
          </article>
          {reading.questions.map((rq, qi) => (
            <div key={qi} className="flex flex-col gap-2" lang="en">
              <h3 className="text-[16px] font-medium leading-snug">{rq.prompt}</h3>
              {rq.options.map((o, oi) => (
                <button key={oi} type="button" aria-pressed={readingAnswers[qi] === oi} className={option(readingAnswers[qi] === oi)}
                  onClick={() => setReadingAnswers(Object.assign([...readingAnswers], { [qi]: oi }))}>
                  {o}
                </button>
              ))}
            </div>
          ))}
          <button type="button" className={primary}
            disabled={reading.questions.some((_, i) => readingAnswers[i] === undefined)} onClick={() => setStep("writing")}>
            Далі
          </button>
        </section>
      )}

      {step === "writing" && (
        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-[22px] font-semibold leading-tight">Напиши 3–4 речення</h1>
            <p className="text-[15px] leading-relaxed" lang="en">{WRITING_TASK}</p>
            <p className="text-[14px] leading-snug text-muted">Пиши як вийде, без перекладача — AI знайде типові помилки, і з них почнеться твоя граматика.</p>
          </div>
          <textarea
            value={writing}
            onChange={(e) => setWriting(e.target.value.slice(0, WRITING_MAX_CHARS))}
            rows={7}
            lang="en"
            placeholder="I work as…"
            className="w-full resize-y rounded-xl border border-[color:var(--muted)]/25 bg-surface px-4 py-3 text-[16px] leading-relaxed outline-none focus:border-accent"
          />
          <p className="text-[14px] text-muted">
            {writingLen < WRITING_MIN_CHARS ? `Ще хоча б ${WRITING_MIN_CHARS - writingLen} символів` : "Достатньо, можна надсилати"}
          </p>
          <button type="button" className={primary} disabled={writingLen < WRITING_MIN_CHARS}
            onClick={() => { setError(null); void submit(); }}>
            Завершити тест
          </button>
        </section>
      )}

      {step === "checking" && (
        <section className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--muted)]/30 border-t-accent" />
          <p className="text-[16px] font-medium">Перевіряю текст і рахую результат…</p>
          <p className="text-[14px] text-muted">Зазвичай до 20 секунд.</p>
        </section>
      )}

      {step === "result" && result && <ResultView result={result} />}
    </main>
  );
}

function Blank({ text }: { text: string }) {
  const [a, b] = text.split("___");
  return (
    <span lang="en">
      {a}
      <span className="mx-0.5 inline-block w-14 border-b-2 border-accent align-baseline" aria-label="пропуск" />
      {b}
    </span>
  );
}

function ResultView({ result }: { result: Result }) {
  const rows = [
    { title: "Словник", value: `≈ ${result.vocab.size.toLocaleString("uk-UA")} слів`, level: result.vocab.cefr },
    { title: "Граматика", value: `${result.grammar.correct} з ${result.grammar.total} правильно`, level: result.grammar.level },
    { title: "Читання", value: `${result.reading.correct} з ${result.reading.total} правильно`, level: result.reading.level },
    { title: "Письмо", value: result.writing ? `помилок знайдено: ${result.writing.errors.length}` : "не вдалося оцінити", level: result.writing?.level ?? "—" },
  ];
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold leading-tight">Твій профіль</h1>
        <p className="text-[15px] leading-relaxed text-muted">Це стартова оцінка. Далі вона уточнюється з повторень і розмов.</p>
      </div>

      <div className="flex flex-col divide-y divide-[color:var(--muted)]/15 overflow-hidden rounded-2xl bg-surface">
        {rows.map((r) => (
          <div key={r.title} className="flex items-center justify-between gap-3 px-4 py-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[16px] font-medium">{r.title}</span>
              <span className="text-[14px] text-muted">{r.value}</span>
            </div>
            <span className="shrink-0 font-mono text-[20px] font-semibold">{r.level}</span>
          </div>
        ))}
      </div>

      {result.grammar.weakTopics.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-[16px] font-medium">Що підтягнути в граматиці</h2>
          <div className="flex flex-wrap gap-2">
            {result.grammar.weakTopics.map((t) => (
              <span key={t.topic} className="rounded-full border border-[color:var(--muted)]/30 px-3 py-1.5 text-[14px]">
                {topicLabel(t.topic)}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.writing && result.writing.errors.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-[16px] font-medium">Помилки в тексті</h2>
          <ul className="flex flex-col gap-2">
            {result.writing.errors.map((e, i) => (
              <li key={i} className="flex flex-col gap-1 rounded-xl bg-surface px-4 py-3">
                <p className="text-[15px] leading-snug" lang="en">
                  <span className="text-muted line-through">{e.original}</span> → <span className="font-medium">{e.corrected}</span>
                </p>
                {e.explanation && <p className="text-[14px] leading-snug text-muted">{e.explanation}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href="/" className={`${primary} text-center`}>
        На головну
      </Link>
    </section>
  );
}
