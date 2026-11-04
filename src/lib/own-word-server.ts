import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/supabase";
import {
  OWN_WORD_SCHEMA,
  OWN_WORD_SYSTEM,
  normalizeContext,
  normalizeOwnWord,
  ownWordUserMessage,
  parseOwnWord,
  type OwnWordInfo,
} from "@/lib/own-word";

const anthropic = new Anthropic();

export type AddOwnWordResult =
  | { status: "added" | "exists"; card: OwnWordInfo }
  | { status: "invalid" | "not_a_word" | "ai_error" };

type Found = { word: string; translation: string; transcription: string | null; example: string | null };
const info = (f: Found): OwnWordInfo => ({
  word: f.word,
  translation: f.translation,
  transcription: f.transcription ?? "",
  example: f.example ?? "",
});

/** Картка юзера з таким словом: власна або з набору. Слово вже нормалізоване (без % і _), тож ilike = порівняння без регістру. */
async function findUserCard(userId: string, word: string): Promise<Found | null> {
  const [own, fromSet] = await Promise.all([
    db.from("cards").select("word, translation, transcription, example").eq("user_id", userId).ilike("word", word).limit(1),
    db.from("cards").select("words!inner(word, translation, transcription, example)").eq("user_id", userId).ilike("words.word", word).limit(1),
  ]);
  if (own.error || fromSet.error) throw own.error ?? fromSet.error;
  if (own.data[0]) return own.data[0] as Found;
  const w = (fromSet.data[0] as unknown as { words: Found } | undefined)?.words;
  return w ?? null;
}

/** Слово є в наших наборах → картка з word_id (готові переклад/приклад, без виклику Claude). */
async function addFromSet(userId: string, word: string): Promise<OwnWordInfo | null> {
  const { data, error } = await db.from("words").select("id, word, translation, transcription, example").ilike("word", word).limit(1);
  if (error) throw error;
  const w = data[0];
  if (!w) return null;
  const ins = await db.from("cards").upsert({ user_id: userId, word_id: w.id }, { onConflict: "user_id,word_id", ignoreDuplicates: true });
  if (ins.error) throw ins.error;
  return info(w);
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

/** Додає юзеру картку зі своїм словом. Дубль (вже є власне або з набору) → status 'exists' без нової картки. */
export async function addOwnWord(userId: string, rawWord: unknown, rawContext?: unknown): Promise<AddOwnWordResult> {
  const word = normalizeOwnWord(rawWord);
  if (!word) return { status: "invalid" };
  const context = normalizeContext(rawContext);

  const existing = await findUserCard(userId, word);
  if (existing) return { status: "exists", card: info(existing) };
  const fromSet = await addFromSet(userId, word);
  if (fromSet) return { status: "added", card: fromSet };

  const ai = await askClaude(word, context);
  if (typeof ai === "string") return { status: ai };

  // Claude міг виправити написання/привести до леми — перевіряємо ще раз уже нормальну форму
  if (ai.word.toLowerCase() !== word.toLowerCase()) {
    const again = await findUserCard(userId, ai.word);
    if (again) return { status: "exists", card: info(again) };
    const set2 = await addFromSet(userId, ai.word);
    if (set2) return { status: "added", card: set2 };
  }

  const { error } = await db.from("cards").insert({
    user_id: userId,
    word: ai.word,
    translation: ai.translation,
    transcription: ai.transcription || null,
    example: ai.example || null,
  });
  if (error) throw error;
  return { status: "added", card: ai };
}
