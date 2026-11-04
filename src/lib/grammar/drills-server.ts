import "server-only";
import fs from "fs";
import path from "path";
import { db } from "@/lib/supabase";
import { startOfLocalDay } from "@/lib/srs/session";
import {
  bankErrors, checkBankAnswer, checkOwnAnswer, drillsPerDay, pickDrills, topicPriorities,
  type AttemptRow, type BankItem, type BankTopic, type Checked, type DrillView, type Level, type MistakeRow, type WeakTopic,
} from "./drills";

let cache: Map<string, BankTopic> | null = null;

/** Банк з data/grammar/*.json. Файл зі зламаною схемою пропускаємо (лог), а не валимо сесію. */
export function loadBank(): Map<string, BankTopic> {
  if (cache) return cache;
  const dir = path.join(process.cwd(), "data", "grammar");
  const bank = new Map<string, BankTopic>();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const t = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as BankTopic;
    const errs = bankErrors(t);
    if (errs.length) console.error("grammar bank", f, errs.slice(0, 3));
    else bank.set(t.topic, t);
  }
  cache = bank;
  return bank;
}

function findItem(id: string): { topic: BankTopic; item: BankItem } | null {
  for (const t of loadBank().values()) {
    const item = t.items.find((x) => x.id === id);
    if (item) return { topic: t, item };
  }
  return null;
}

type DrillUser = { id: string; minutes_per_day: number; timezone: string };

export async function drillSession(user: DrillUser, now: Date): Promise<{ drills: DrillView[]; doneToday: number; limit: number }> {
  const since = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const [profile, mistakes, attempts] = await Promise.all([
    db.from("skill_profile").select("grammar_level, weak_topics").eq("user_id", user.id).maybeSingle(),
    db.from("mistakes").select("id, kind, topic, original, corrected, explanation, created_at").eq("user_id", user.id)
      .neq("source", "drill").gte("created_at", since).order("created_at", { ascending: false }).limit(100),
    db.from("grammar_attempts").select("item_id, topic, correct, created_at").eq("user_id", user.id)
      .gte("created_at", since).order("created_at", { ascending: false }).limit(500),
  ]);
  if (profile.error) throw profile.error;
  if (mistakes.error) throw mistakes.error;
  if (attempts.error) throw attempts.error;

  const bank = loadBank();
  const att = attempts.data as AttemptRow[];
  const dayStart = startOfLocalDay(now, user.timezone).getTime();
  const today = new Set(att.filter((a) => Date.parse(a.created_at) >= dayStart).map((a) => a.item_id));
  const limit = drillsPerDay(user.minutes_per_day);
  const mistakeRows = mistakes.data as MistakeRow[];

  const priorities = topicPriorities({
    weak: (profile.data?.weak_topics ?? []) as WeakTopic[], mistakes: mistakeRows, attempts: att, known: new Set(bank.keys()), now,
  });
  const drills = pickDrills({
    bank, priorities, mistakes: mistakeRows, attempts: att, level: (profile.data?.grammar_level ?? null) as Level | null,
    limit: limit - today.size, now, exclude: today,
  });
  return { drills, doneToday: today.size, limit };
}

export type AnswerResult = (Checked & { status: "ok" }) | { status: "not_found" };

/**
 * Перевіряє відповідь і пише спробу. accept = юзер після показу еталону каже «моя теж правильна»
 * (вільна відповідь може мати інший правильний варіант) — тоді виправляємо останню спробу на correct.
 */
export async function answerDrill(userId: string, itemId: string, answer: string, accept: boolean): Promise<AnswerResult> {
  let checked: Checked;
  let topic: string;
  if (/^m\d+$/.test(itemId)) {
    const { data, error } = await db.from("mistakes").select("topic, corrected, explanation")
      .eq("id", Number(itemId.slice(1))).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!data) return { status: "not_found" };
    checked = checkOwnAnswer(data, answer);
    topic = data.topic;
  } else {
    const found = findItem(itemId);
    if (!found) return { status: "not_found" };
    checked = checkBankAnswer(found.item, answer);
    topic = found.topic.topic;
    if (accept && found.item.type === "choice") accept = false; // варіант або правильний, або ні
  }

  if (accept) {
    const { data: last, error } = await db.from("grammar_attempts").select("id").eq("user_id", userId).eq("item_id", itemId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (last) {
      const upd = await db.from("grammar_attempts").update({ correct: true }).eq("id", last.id);
      if (upd.error) throw upd.error;
      return { status: "ok", ...checked, correct: true };
    }
  }

  const ins = await db.from("grammar_attempts").insert({ user_id: userId, item_id: itemId, topic, correct: checked.correct, answer: answer.slice(0, 300) });
  if (ins.error) throw ins.error;
  return { status: "ok", ...checked };
}
