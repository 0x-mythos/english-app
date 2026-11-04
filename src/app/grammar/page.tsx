"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Drill } from "@/components/drill";
import { ArrowLeftIcon, SparkIcon } from "@/components/icons";
import type { DrillView } from "@/lib/grammar/drills";
import { api, tgInit } from "@/lib/tg-client";

type Session = { drills: DrillView[]; doneToday: number; limit: number };

// Лише граматика: ті самі денні дрили, що вплетені в /learn (спільний денний ліміт).
export default function Grammar() {
  const [s, setS] = useState<Session | null>(null);
  const [idx, setIdx] = useState(0);
  const [right, setRight] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tgInit();
    api<Session>("/api/grammar/session")
      .then(setS)
      .catch((e: Error) =>
        setError(e.message === "unauthorized" ? "Відкрий застосунок через бота в Telegram." : "Не вдалося завантажити вправи."),
      );
  }, []);

  const total = s?.drills.length ?? 0;
  const drill = s && idx < total ? s.drills[idx] : null;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-10 pt-5">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-[15px] font-semibold text-muted hover:text-foreground">
            <ArrowLeftIcon className="size-4" /> Головна
          </Link>
          {total > 0 && (
            <span className="rounded-full bg-surface px-3 py-1 font-display text-[13px] font-semibold shadow-card">
              {idx}<span className="text-muted"> / {total}</span>
            </span>
          )}
        </div>
        {total > 0 && (
          <div className="h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={idx} aria-valuemax={total}>
            <div className="h-full rounded-full bg-berry transition-[width] duration-500 ease-out" style={{ width: `${(idx / total) * 100}%` }} />
          </div>
        )}
      </header>

      {error && <p className="rounded-2xl bg-accent/12 px-4 py-3 text-[14px] font-medium leading-snug text-accent" role="alert">{error}</p>}

      {!s && !error && <div className="h-64 animate-pulse rounded-[28px] bg-line" />}

      {drill && (
        <Drill
          key={drill.id}
          drill={drill}
          onDone={(ok) => {
            if (ok) setRight((n) => n + 1);
            setIdx((i) => i + 1);
          }}
        />
      )}

      {s && !drill && (
        <section className="pop-in flex flex-col items-start gap-4 rounded-[28px] bg-berry px-6 pb-6 pt-8 text-white shadow-card">
          <SparkIcon className="size-10" />
          <h1 className="font-display text-[28px] font-semibold leading-tight">
            {total > 0 ? `${right} з ${total} правильно` : "Граматику на сьогодні зроблено"}
          </h1>
          <p className="text-[16px] leading-relaxed opacity-95">
            {total > 0
              ? "Теми підбираються з твоїх помилок у розмовах і тесті. Де помилився — повториться в наступні дні."
              : "Нові вправи з'являться завтра. А нові помилки з розмови з AI теж стануть вправами."}
          </p>
          <Link href="/" className="mt-1 rounded-full bg-white px-5 py-2.5 text-[15px] font-semibold text-berry">На головну</Link>
        </section>
      )}
    </main>
  );
}
