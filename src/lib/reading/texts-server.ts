import "server-only";
import fs from "fs";
import path from "path";
import { db } from "@/lib/supabase";
import { fetchWordRows, findUserCard } from "@/lib/own-word-server";
import type { CardStore } from "./add-card";
import { emptyDict, loadDictionaryFrom, type DictIndex } from "./dictionary";
import { textErrors, type ReadingText } from "./schema";

let cache: Map<string, ReadingText> | null = null;

/** Банк з data/reading/*.json. Зламаний файл пропускаємо з логом (як у банку граматики); немає папки — порожній банк. */
export function loadTexts(): Map<string, ReadingText> {
  if (cache) return cache;
  const dir = path.join(process.cwd(), "data", "reading");
  const texts = new Map<string, ReadingText>();
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  for (const f of files) {
    try {
      const t = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as ReadingText;
      const errs = textErrors(t, f.replace(/\.json$/, ""));
      if (errs.length) console.error("reading bank", f, errs.slice(0, 3));
      else texts.set(t.id, t);
    } catch (e) {
      console.error("reading bank: broken file", f, e);
    }
  }
  cache = texts;
  return texts;
}

let dictCache: DictIndex | null = null;

/** Спільний словник з data/reading-dict/dictionary.json (шлях від process.cwd(), кеш). Немає файлу чи він зламаний — порожній словник (зламаний з логом). */
export function loadDictionary(): DictIndex {
  if (dictCache) return dictCache;
  const file = path.join(process.cwd(), "data", "reading-dict", "dictionary.json");
  dictCache = loadDictionaryFrom(
    () => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null),
    (e) => console.error("reading dictionary: broken file, working without it", e),
  );
  return dictCache ?? emptyDict();
}

export { fetchWordRows, findUserCard };

/** Сховище карток юзера для runAddReadingCard. */
export function cardStore(userId: string): CardStore {
  return {
    findUserCard: (w) => findUserCard(userId, w),
    async insertWordCard(row, example) {
      const { error } = await db
        .from("cards")
        .upsert({ user_id: userId, word_id: row.id, example }, { onConflict: "user_id,word_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    async insertOwnCard(c) {
      const { error } = await db.from("cards").insert({
        user_id: userId, word: c.word, translation: c.translation, transcription: c.transcription, example: c.example,
      });
      if (error) throw error;
    },
  };
}
