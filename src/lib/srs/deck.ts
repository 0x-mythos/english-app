import "server-only";
import { db } from "@/lib/supabase";
import { vocabCefr } from "@/lib/placement/vocab";
import { dailyLimits, everydayStartRank, interleave, itCefrLevels, startOfLocalDay } from "@/lib/srs/session";

export type DeckUser = { id: string; goals: string[]; minutes_per_day: number; timezone: string };

type WordRow = { id: number; set_name: string; topic: string | null; freq_rank: number | null; cefr: string | null };

const CANDIDATES = 300;

/** Скільки нових карток ще можна додати сьогодні: ліміт − уже показані сьогодні вперше − ще не показані. */
export async function newSlotsLeft(user: DeckUser, now: Date) {
  const { newPerDay } = dailyLimits(user.minutes_per_day);
  const dayStart = startOfLocalDay(now, user.timezone).toISOString();
  const [intro, pending] = await Promise.all([
    db.from("review_logs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("state", 0).gte("reviewed_at", dayStart),
    db.from("cards").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("state", 0),
  ]);
  if (intro.error || pending.error) throw intro.error ?? pending.error;
  return Math.max(0, newPerDay - (intro.count ?? 0) - (pending.count ?? 0));
}

/** Нові слова під рівень: everyday — від межі словника вгору за частотою, IT — від рівня словника; теми впереміш. */
async function pickNewWords(user: DeckUser, vocabSizeEst: number | null, n: number): Promise<number[]> {
  const goals = user.goals.length ? user.goals : ["it", "everyday"];
  const { data: owned, error } = await db.from("cards").select("word_id").eq("user_id", user.id).not("word_id", "is", null);
  if (error) throw error;
  const have = new Set(owned.map((c) => c.word_id as number));

  const queries = [];
  if (goals.includes("everyday")) {
    queries.push(
      db.from("words").select("id, set_name, topic, freq_rank, cefr").eq("set_name", "everyday")
        .gte("freq_rank", everydayStartRank(vocabSizeEst)).order("freq_rank").limit(CANDIDATES),
    );
  }
  if (goals.includes("it")) {
    const levels = itCefrLevels(vocabSizeEst != null ? vocabCefr(vocabSizeEst) : null);
    queries.push(
      db.from("words").select("id, set_name, topic, freq_rank, cefr").eq("set_name", "it")
        .in("cefr", levels).order("cefr").order("freq_rank").limit(CANDIDATES),
    );
  }
  const results = await Promise.all(queries);
  const words: WordRow[] = [];
  for (const r of results) {
    if (r.error) throw r.error;
    words.push(...(r.data as WordRow[]).filter((w) => !have.has(w.id)));
  }
  return interleave(words, (w) => `${w.set_name}:${w.topic ?? ""}`).slice(0, n).map((w) => w.id);
}

/** Докидає нові картки на сьогодні (ідемпотентно: повторний виклик у той самий день нічого не додає). */
export async function topUpNewCards(user: DeckUser, now: Date) {
  const slots = await newSlotsLeft(user, now);
  if (slots === 0) return 0;
  const { data: profile } = await db.from("skill_profile").select("vocab_size_est").eq("user_id", user.id).maybeSingle();
  const ids = await pickNewWords(user, profile?.vocab_size_est ?? null, slots);
  if (ids.length === 0) return 0;
  const { error } = await db
    .from("cards")
    .upsert(ids.map((word_id) => ({ user_id: user.id, word_id })), { onConflict: "user_id,word_id", ignoreDuplicates: true });
  if (error) throw error;
  return ids.length;
}

/** Скільки карток чекає зараз (повтори + ще не показані нові). */
export async function dueCount(userId: string, now: Date) {
  const { count, error } = await db
    .from("cards").select("id", { count: "exact", head: true }).eq("user_id", userId).lte("due", now.toISOString());
  if (error) throw error;
  return count ?? 0;
}

/** Чи займався юзер сьогодні (за його часовим поясом). */
export async function studiedToday(user: DeckUser, now: Date) {
  const { count, error } = await db
    .from("review_logs").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).gte("reviewed_at", startOfLocalDay(now, user.timezone).toISOString());
  if (error) throw error;
  return (count ?? 0) > 0;
}
