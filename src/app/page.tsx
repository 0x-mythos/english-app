"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookIcon, CardsIcon, ChatIcon, SparkIcon } from "@/components/icons";
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
type Me = { user: { id: string; first_name: string | null }; due: number; profile: Profile | null };

const soon = [
  { title: "Розмова з AI", note: "Співбесіда, стендап, small talk. 1–2 точкові виправлення за раз.", icon: ChatIcon, tone: "bg-sky/15 text-sky" },
  { title: "Читання", note: "Тексти трохи вище твого рівня, тап по слову — і воно в картках.", icon: BookIcon, tone: "bg-mint/15 text-mint" },
];

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initData = tgInit();
    fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData }),
    })
      .then(async (r) => (r.ok ? setMe(await r.json()) : setError(r.status === 401 ? "Відкрий застосунок через бота в Telegram." : "Сервер не відповів, спробуй пізніше.")))
      .catch(() => setError("Немає з'єднання з сервером."));
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

      {me && (
        <section className="flex flex-col gap-3 pt-1">
          <h2 className="font-display text-[17px] font-semibold">Скоро</h2>
          <div className="flex flex-col gap-2.5">
            {soon.map(({ title, note, icon: Icon, tone }) => (
              <div key={title} className="flex items-start gap-3.5 rounded-2xl bg-surface px-4 py-4 shadow-card">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                  <Icon className="size-6" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h3 className="text-[16px] font-bold">{title}</h3>
                  <p className="text-[14px] leading-snug text-muted">{note}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
