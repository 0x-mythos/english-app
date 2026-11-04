import "server-only";
import { db } from "@/lib/supabase";
import { localDate } from "@/lib/srs/session";
import { EMPTY_STREAK, applyActivity, viewStreak, type Streak, type StreakView } from "@/lib/streak";

async function load(userId: string): Promise<Streak> {
  const { data, error } = await db.from("streaks").select("current, best, freezes, last_active").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data as Streak | null) ?? EMPTY_STREAK;
}

/** Зараховує сьогоднішній день (після повтору). Одночасні повтори пишуть однаковий результат — це безпечно. */
export async function recordActivity(userId: string, timeZone: string, now: Date) {
  const today = localDate(now, timeZone);
  const prev = await load(userId);
  const next = applyActivity(prev, today);
  if (next === prev) return;
  const { error } = await db.from("streaks").upsert({ user_id: userId, ...next }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function streakView(userId: string, timeZone: string, now: Date): Promise<StreakView> {
  return viewStreak(await load(userId), localDate(now, timeZone));
}
