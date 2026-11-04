"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

const sections = [
  { title: "Розмова з AI", note: "Співбесіда, стендап, small talk. 1–2 точкові виправлення за раз." },
  { title: "Читання", note: "Тексти трохи вище твого рівня, тап по слову — і воно в картках." },
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
    <main className="mx-auto flex max-w-md flex-col gap-8 px-4 pb-10 pt-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">English with AI</p>
        <h1 className="text-[28px] font-semibold leading-tight">
          {me ? `Привіт, ${me.user.first_name ?? "друже"}` : error ? "Ой" : "Завантаження…"}
        </h1>
        <p className="text-[15px] leading-relaxed text-muted">
          {error ??
            (me
              ? me.due > 0
                ? `На сьогодні ${me.due} карток на повтор.`
                : profile
                  ? "Нові слова на сьогодні вже чекають у картках."
                  : "Почнімо з короткого тесту — він покаже, з чого тобі варто стартувати."
              : " ")}
        </p>
      </header>

      {me && !profile && (
        <Link href="/test" className="flex flex-col gap-1 rounded-2xl bg-accent px-4 py-4 text-accent-fg">
          <span className="text-[17px] font-medium">Пройти тест рівня →</span>
          <span className="text-[14px] leading-snug opacity-85">10–15 хв: словник, граматика, читання, письмо. З нього стартує все інше.</span>
        </Link>
      )}

      {profile && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[16px] font-medium">Твій профіль</h2>
            <Link href="/test" className="text-[14px] text-muted hover:text-foreground">Пройти ще раз</Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { title: "Словник", level: profile.vocab_size_est != null ? `≈ ${profile.vocab_size_est.toLocaleString("uk-UA")}` : "—" },
              { title: "Граматика", level: profile.grammar_level ?? "—" },
              { title: "Читання", level: profile.reading_level ?? "—" },
              { title: "Письмо", level: profile.writing_level ?? "—" },
            ].map((s) => (
              <div key={s.title} className="flex flex-col gap-1 rounded-2xl bg-surface px-4 py-3">
                <span className="text-[13px] text-muted">{s.title}</span>
                <span className="font-mono text-[20px] font-semibold">{s.level}</span>
              </div>
            ))}
          </div>
          {profile.weak_topics.length > 0 && (
            <p className="text-[14px] leading-snug text-muted">
              Підтягнути: {profile.weak_topics.slice(0, 4).map((t) => topicLabel(t.topic)).join(", ")}
            </p>
          )}
        </section>
      )}

      {profile && (
        <Link href="/learn" className="flex flex-col gap-1 rounded-2xl bg-accent px-4 py-4 text-accent-fg">
          <span className="text-[17px] font-medium">{me && me.due > 0 ? `Повторити ${me.due} →` : "Картки →"}</span>
          <span className="text-[14px] leading-snug opacity-85">Слова в реченнях, повтор за FSRS — тоді, коли ти от-от забудеш.</span>
        </Link>
      )}

      <section className="flex flex-col divide-y divide-[color:var(--muted)]/15 overflow-hidden rounded-2xl bg-surface">
        {sections.map((s) => (
          <div key={s.title} className="flex flex-col gap-1 px-4 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[16px] font-medium">{s.title}</h2>
              <span className="shrink-0 text-xs text-muted">скоро</span>
            </div>
            <p className="text-[14px] leading-snug text-muted">{s.note}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
