import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/supabase";
import {
  OWN_WORD_SCHEMA,
  OWN_WORD_SYSTEM,
  normalizeOwnWord,
  ownWordUserMessage,
  parseOwnWord,
  type OwnWordInfo,
} from "@/lib/own-word";
import { OWN_WORD_DAILY_LIMIT, createDailyLimiter } from "@/lib/own-word-limit";
import { runAddOwnWord, type AddOwnWordResult } from "@/lib/own-word-flow";
import { pickWordRow, type WordRow } from "@/lib/reading/lookup";
import { localDate, wholeWordMatch } from "@/lib/srs/session";

const anthropic = new Anthropic();

export type { AddOwnWordResult };

type Found = { word: string; translation: string; transcription: string | null; example: string | null };
const info = (f: Found): OwnWordInfo => ({
  word: f.word,
  translation: f.translation,
  transcription: f.transcription ?? "",
  example: f.example ?? "",
});

/** Картка юзера з таким словом: власна або з набору. Слово вже нормалізоване (без % і _), тож ilike = порівняння без регістру. */
export async function findUserCard(userId: string, word: string): Promise<Found | null> {
  const [own, fromSet] = await Promise.all([
    db.from("cards").select("word, translation, transcription, example").eq("user_id", userId).ilike("word", word).limit(1),
    db.from("cards").select("words!inner(word, translation, transcription, example)").eq("user_id", userId).ilike("words.word", word).limit(1),
  ]);
  if (own.error || fromSet.error) throw own.error ?? fromSet.error;
  if (own.data[0]) return own.data[0] as Found;
  const w = (fromSet.data[0] as unknown as { words: Found } | undefined)?.words;
  return w ?? null;
}

const WORD_COLS = "id, word, translation, transcription, example, set_name";

/** Усі рядки words з таким словом (слово може бути в кількох наборах). Вибір одного — спільне правило pickWordRow. */
export async function fetchWordRows(word: string): Promise<WordRow[]> {
  const { data, error } = await db.from("words").select(WORD_COLS).ilike("word", word).limit(20);
  if (error) throw error;
  return data as WordRow[];
}

/**
 * Слово є в наших наборах → картка з word_id (готові переклад/приклад, без виклику Claude).
 * `context` (необов'язково) → cards.example, але лише коли речення містить `form` (за замовчуванням — саме слово) як ціле слово.
 */
export async function addFromSet(userId: string, word: string, context?: string | null, form?: string): Promise<OwnWordInfo | null> {
  const w = pickWordRow(await fetchWordRows(word));
  if (!w) return null;
  const example = context && wholeWordMatch(context, form ?? word) ? context : null;
  const ins = await db.from("cards").upsert({ user_id: userId, word_id: w.id, ...(example ? { example } : {}) }, { onConflict: "user_id,word_id", ignoreDuplicates: true });
  if (ins.error) throw ins.error;
  return info({ ...w, example: example ?? w.example });
}

async function askClaude(word: string, context: string | null): Promise<OwnWordInfo | "not_a_word" | "ai_error"> {
  try {
    const msg = await anthropic.messages.create(
      {
        model: "claude-sonnet-5-5",
        max_tokens: 600,
        system: OWN_WORD_SYSTEM,
        output_config: { format: { type: "json_schema", schema: OWN_WORD_SCHEMA } },
        messages: [{ role: "user", content: ownWordUserMessage({ word, context }) }],
      } as Anthropic.MessageCreateParamsNonStreaming,
      { timeout: 30_000 },
    );
    const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return parseOwnWord(raw) ?? "not_a_word";
  } catch (e) {
    console.error("own word: claude failed", e);
    return "ai_error";
  }
}

/**
 * Слово з уже готовими перекладом/прикладом (напр. з розмови з AI) → картка без нового виклику Claude.
 * Дубль → 'exists'; є в наборах → картка з набору.
 */
export async function addKnownWord(userId: string, raw: Partial<Record<keyof OwnWordInfo, unknown>>): Promise<AddOwnWordResult> {
  const word = normalizeOwnWord(raw.word);
  const translation = typeof raw.translation === "string" ? raw.translation.trim().slice(0, 200) : "";
  if (!word || !translation) return { status: "invalid" };

  const existing = await findUserCard(userId, word);
  if (existing) return { status: "exists", card: info(existing) };
  const fromSet = await addFromSet(userId, word);
  if (fromSet) return { status: "added", card: fromSet };

  const transcription = typeof raw.transcription === "string" ? raw.transcription.trim().slice(0, 80) : "";
  const ex = typeof raw.example === "string" ? raw.example.trim().slice(0, 300) : "";
  const example = ex.toLowerCase().includes(word.toLowerCase()) ? ex : "";
  const { error } = await db.from("cards").insert({
    user_id: userId, word, translation, transcription: transcription || null, example: example || null,
  });
  if (error) throw error;
  return { status: "added", card: { word, translation, transcription, example } };
}

// на globalThis: бот і /api/cards/own можуть бути в різних чанках, а лічильник має бути спільним
const g = globalThis as { __ownWordLimiter?: ReturnType<typeof createDailyLimiter> };
const limiter = (g.__ownWordLimiter ??= createDailyLimiter(OWN_WORD_DAILY_LIMIT));

async function takeLimit(userId: string): Promise<boolean> {
  const { data } = await db.from("users").select("timezone").eq("id", userId).maybeSingle();
  return limiter.take(userId, localDate(new Date(), data?.timezone ?? "Europe/Warsaw"));
}

/**
 * Додає юзеру картку зі своїм словом. Дубль (вже є власне або з набору) → 'exists' без нової картки.
 * Денний ліміт викликів Claude (30) → 'limit'; слова з наборів і дублі ліміт не витрачають.
 */
export function addOwnWord(userId: string, rawWord: unknown, rawContext?: unknown): Promise<AddOwnWordResult> {
  return runAddOwnWord(
    {
      findUserCard: (w) => findUserCard(userId, w),
      addFromSet: (w) => addFromSet(userId, w),
      askClaude,
      takeLimit,
      insertCard: async (c) => {
        const { error } = await db.from("cards").insert({
          user_id: userId, word: c.word, translation: c.translation, transcription: c.transcription || null, example: c.example || null,
        });
        if (error) throw error;
      },
    },
    userId,
    rawWord,
    rawContext,
  );
}
