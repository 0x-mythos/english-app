import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildDictIndex, coverage, dictionaryErrors, MAX_UNTRANSLATED_RATIO, type DictFile } from "./dictionary";
import { normForm } from "./lookup";
import { textErrors, type ReadingText } from "./schema";

// Тексти генерують субагенти — кожен файл має пройти схему, інакше сервер його пропустить.
// Папка може бути порожньою чи неповною (тексти пишуться паралельно) — тоді перевіряємо те, що є.
const dir = path.join(__dirname, "../../../data/reading");
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as ReadingText;

describe("банк текстів для читання", () => {
  it.each(files)("%s відповідає схемі", (f) => {
    expect(textErrors(load(f), f.replace(/\.json$/, ""))).toEqual([]);
  });

  it("id унікальні", () => {
    const ids = files.map((f) => load(f).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("частка IT-текстів (topic ≠ everyday) не менша за 60%", () => {
    if (files.length === 0) return;
    const it = files.filter((f) => load(f).topic !== "everyday").length;
    expect(it / files.length).toBeGreaterThanOrEqual(0.6);
  });

  it("якщо тексти є повним набором: 12 штук, 6 B1 і 6 B2", () => {
    if (files.length < 12) return;
    const levels = files.map((f) => load(f).level);
    expect(files.length).toBe(12);
    expect(levels.filter((l) => l === "B1").length).toBe(6);
    expect(levels.filter((l) => l === "B2").length).toBe(6);
  });
});

// Спільний словник: файл генерує окремий агент. Поки його нема — тести пропускаються, а не падають.
const dictPath = path.join(__dirname, "../../../data/reading-dict/dictionary.json");
const wordsDir = path.join(__dirname, "../../../data/words");

/** Усі слова з data/words/*.json — формат `{ batches: { "<діапазон>": [{ word, ... }] } }`. */
function loadWordsSet(): Set<string> {
  const set = new Set<string>();
  if (!fs.existsSync(wordsDir)) return set;
  for (const f of fs.readdirSync(wordsDir).filter((x) => x.endsWith(".json"))) {
    const j = JSON.parse(fs.readFileSync(path.join(wordsDir, f), "utf8")) as { batches?: Record<string, { word: string }[]> };
    for (const batch of Object.values(j.batches ?? {})) for (const w of batch) set.add(normForm(w.word));
  }
  return set;
}

describe.skipIf(!fs.existsSync(dictPath))("спільний словник читання (реальний файл)", () => {
  const raw = fs.existsSync(dictPath) ? (JSON.parse(fs.readFileSync(dictPath, "utf8")) as DictFile) : null;

  it("відповідає схемі", () => {
    expect(dictionaryErrors(raw)).toEqual([]);
  });

  it("покриває кожне слово кожного тексту; untranslated ≤ 3% унікальних слів", () => {
    const texts = files.map(load);
    const r = coverage(texts, buildDictIndex(raw as DictFile), loadWordsSet(), (raw as DictFile).untranslated);
    expect(r.missing.slice(0, 20)).toEqual([]);
    expect(r.untranslatedRatio).toBeLessThanOrEqual(MAX_UNTRANSLATED_RATIO);
  });
});
