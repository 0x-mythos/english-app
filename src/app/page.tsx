"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AddWord } from "@/components/add-word";
import { BookIcon, CardsIcon, ChatIcon, FlameIcon, PencilIcon, SnowIcon, SparkIcon } from "@/components/icons";
import { tgInit } from "@/lib/tg-client";
import { topicLabel } from "@/lib/placement/topics";

type Profile = {
  vocab_size_est: number | null;
  grammar_level: string | null;
  reading_level: string | null;
  writing_level: string | null;
  weak_topics: { topic: string; score: number }[];
  tested_at: string | null;
};
type Streak = { current: number; best: number; freezes: number; doneToday: boolean; frozenDays: number };
type Me = {
  user: { id: string; first_name: string | null };
  due: number;
  profile: Profile | null;
  progress: { learned: number; learning: number };
  streak: Streak | null;
};

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(initData: string) {
    fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData }),
    })
      .then(async (r) => (r.ok ? setMe(await r.json()) : setError(r.status === 401 ? "Відкрий застосунок через бота в Telegram." : "Сервер не відповів, спробуй пізніше.")))
      .catch(() => setError("Немає з'єднання з сервером."));
  }

  useEffect(() => {
    load(tgInit());
  }, []);

  const profile = me?.profile?.tested_at ? me.profile : null;

  return (
    // без min-h-dvh: у вебв'ю Telegram Desktop 100dvh трохи більший за вікно → зайвий вертикальний скрол
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-10 pt-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex gap-1" aria-hidden>
            <i className="size-2.5 rounded-full bg-accent" />
            <i className="size-2.5 rounded-full bg-sun" />
            <i className="size-2.5 rounded-full bg-sky" />
          </span>
          <span className="font-display text-[13px] font-semibold tracking-tight">English with AI</span>
        </div>
        <h1 className="font-display text-[30px] font-semibold leading-[1.1] tracking-tight">
          {me ? `Привіт, ${me.user.first_name ?? "друже"}` : error ? "Ой" : " "}
        </h1>
        {error && <p className="text-[15px] leading-relaxed text-muted">{error}</p>}
        {!me && !error && <div className="h-4 w-40 animate-pulse rounded-full bg-line" />}
      </header>

      {me && !profile && (
        <Link
          href="/test"
          className="pop-in relative flex flex-col gap-2 overflow-hidden rounded-[28px] bg-sun px-5 pb-5 pt-6 text-ink shadow-card transition-transform active:scale-[0.99]"
        >
          <SparkIcon className="absolute -right-3 -top-3 size-28 opacity-15" />
          <span className="font-display text-[22px] font-semibold leading-tight">Пройди тест рівня</span>
          <span className="text-[15px] leading-snug opacity-80">10–15 хв: словник, граматика, читання, письмо. З нього стартує все інше.</span>
          <span className="mt-2 self-start rounded-full bg-ink px-4 py-2 text-[15px] font-semibold text-sun">Почати →</span>
        </Link>
      )}

      {profile && me && (
        <Link
          href="/learn"
          className="pop-in relative flex flex-col gap-1 overflow-hidden rounded-[28px] bg-accent px-5 pb-5 pt-6 text-accent-fg shadow-card transition-transform active:scale-[0.99]"
        >
          <CardsIcon className="absolute -right-4 -top-4 size-32 opacity-15" />
          <span className="text-[14px] font-semibold uppercase tracking-[0.12em] opacity-85">Сьогодні</span>
          {me.due > 0 ? (
            <span className="flex items-baseline gap-2">
              <span className="font-display text-[52px] font-bold leading-none">{me.due}</span>
              <span className="text-[17px] font-medium">{plural(me.due, "картка", "картки", "карток")} на повтор</span>
            </span>
          ) : (
            <span className="font-display text-[26px] font-semibold leading-tight">Нові слова чекають</span>
          )}
          <span className="text-[15px] leading-snug opacity-90">Повтор саме тоді, коли слово от-от забудеться.</span>
          <span className="mt-3 self-start rounded-full bg-white px-5 py-2.5 text-[15px] font-semibold text-accent">
            {me.due > 0 ? "Повторити →" : "До карток →"}
          </span>
        </Link>
      )}

      {me && (me.streak || me.progress) && <Stats streak={me.streak} progress={me.progress} />}

      {me && (
        <Link
          href="/chat"
          className="flex items-center gap-3.5 rounded-[24px] bg-sky px-4 py-4 text-white shadow-card transition-transform active:scale-[0.99]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <ChatIcon className="size-6" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-display text-[17px] font-semibold">Розмова з AI</span>
            <span className="text-[14px] leading-snug opacity-90">Співбесіда, стендап, рев&apos;ю коду, small talk — з 1–2 виправленнями за раз.</span>
          </span>
          <span className="shrink-0 text-[20px] font-semibold" aria-hidden>→</span>
        </Link>
      )}

      {me && (
        <Link
          href="/grammar"
          className="flex items-center gap-3.5 rounded-[24px] bg-berry px-4 py-4 text-white shadow-card transition-transform active:scale-[0.99]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <PencilIcon className="size-6" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-display text-[17px] font-semibold">Граматика</span>
            <span className="text-[14px] leading-snug opacity-90">Короткі вправи на теми, де ти помиляєшся, і твої власні речення з розмов.</span>
          </span>
          <span className="shrink-0 text-[20px] font-semibold" aria-hidden>→</span>
        </Link>
      )}

      {me && (
        <Link
          href="/read"
          className="flex items-center gap-3.5 rounded-[24px] bg-mint px-4 py-4 text-ink shadow-card transition-transform active:scale-[0.99]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/30">
            <BookIcon className="size-6" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-display text-[17px] font-semibold">Читання</span>
            <span className="text-[14px] leading-snug opacity-85">Тексти трохи вище твого рівня: торкнись слова — і воно в картках.</span>
          </span>
          <span className="shrink-0 text-[20px] font-semibold" aria-hidden>→</span>
        </Link>
      )}

      {me && <AddWord onAdded={() => load(window.Telegram?.WebApp?.initData ?? "")} />}

      {profile && (
        <section className="flex flex-col gap-3 pt-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[17px] font-semibold">Твій рівень</h2>
            <Link href="/test" className="text-[14px] font-medium text-muted hover:text-foreground">Пройти ще раз</Link>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { title: "Словник", level: profile.vocab_size_est != null ? `≈${profile.vocab_size_est.toLocaleString("uk-UA")}` : "—", tone: "bg-sun/30", text: "text-foreground" },
              { title: "Граматика", level: profile.grammar_level ?? "—", tone: "bg-sky/20", text: "text-sky" },
              { title: "Читання", level: profile.reading_level ?? "—", tone: "bg-mint/20", text: "text-mint" },
              { title: "Письмо", level: profile.writing_level ?? "—", tone: "bg-berry/18", text: "text-berry" },
            ].map((s) => (
              <div key={s.title} className={`flex flex-col gap-1.5 rounded-2xl px-4 py-3.5 ${s.tone}`}>
                <span className="text-[13px] font-medium text-muted">{s.title}</span>
                <span className={`font-display text-[24px] font-semibold leading-none ${s.text}`}>{s.level}</span>
              </div>
            ))}
          </div>
          {profile.weak_topics.length > 0 && (
            <div className="flex flex-col gap-2 rounded-2xl bg-surface px-4 py-3.5 shadow-card">
              <span className="text-[13px] font-medium text-muted">Варто підтягнути</span>
              <div className="flex flex-wrap gap-1.5">
                {profile.weak_topics.slice(0, 4).map((t) => (
                  <span key={t.topic} className="rounded-full bg-accent/12 px-3 py-1 text-[13px] font-semibold text-accent">
                    {topicLabel(t.topic)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

    </main>
  );
}

// Стрік і прогрес: м'яко, без докорів — пропущений день покриває заморозка.
function Stats({ streak, progress }: { streak: Streak | null; progress: Me["progress"] }) {
  const days = streak?.current ?? 0;
  const streakNote = !streak || days === 0
    ? "Один повтор — і день зараховано"
    : streak.doneToday
      ? "Сьогодні вже зараховано"
      : streak.frozenDays > 0
        ? `Заморозка вберегла ${streak.frozenDays} ${plural(streak.frozenDays, "день", "дні", "днів")}`
        : "Повтори сьогодні, щоб продовжити";

  return (
    <section className="grid grid-cols-2 gap-2.5">
      <div className="flex flex-col gap-1.5 rounded-2xl bg-sun/30 px-4 py-3.5">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
          <FlameIcon className={`size-4 ${streak?.doneToday ? "text-accent" : ""}`} /> Стрік
        </span>
        <span className="font-display text-[24px] font-semibold leading-none">
          {days} <span className="text-[15px] font-medium">{plural(days, "день", "дні", "днів")}</span>
        </span>
        <span className="text-[12px] leading-snug text-muted">{streakNote}</span>
        {streak && streak.freezes > 0 && (
          <span className="flex items-center gap-1 text-[12px] font-medium text-sky">
            <SnowIcon className="size-3.5" /> {streak.freezes} {plural(streak.freezes, "заморозка", "заморозки", "заморозок")} в запасі
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5 rounded-2xl bg-mint/20 px-4 py-3.5">
        <span className="text-[13px] font-medium text-muted">Вивчено</span>
        <span className="font-display text-[24px] font-semibold leading-none text-mint">
          {progress.learned} <span className="text-[15px] font-medium">{plural(progress.learned, "слово", "слова", "слів")}</span>
        </span>
        <span className="text-[12px] leading-snug text-muted">
          {progress.learning > 0 ? `ще ${progress.learning} в процесі` : "вивчене — коли згадав його ще раз у повторі"}
        </span>
      </div>
    </section>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
