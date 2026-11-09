// Спільний словник слів текстів для читання (`data/reading-dict/dictionary.json`): схема, індекс, покриття.
// Чисті функції, відносні імпорти (Vitest не знає аліасу `@/`).
import { normForm } from "./lookup";
import type { ReadingText } from "./schema";
import { tokenize } from "./tokenize";

export type DictEntry = { lemma: string; forms: string[]; translation: string; transcription: string };
export type DictFile = { entries: DictEntry[]; untranslated: string[] };
export type DictIndex = { byForm: Map<string, DictEntry>; untranslated: Set<string> };

export const MAX_UNTRANSLATED_RATIO = 0.03;

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Список помилок схеми словника (порожній = файл валідний). */
export function dictionaryErrors(raw: unknown): string[] {
  const e: string[] = [];
  if (!raw || typeof raw !== "object") return ["не об'єкт"];
  const d = raw as Record<string, unknown>;
  if (!Array.isArray(d.untranslated) || !d.untranslated.every(isStr)) e.push("untranslated має бути масивом непорожніх рядків");
  if (!Array.isArray(d.entries)) {
    e.push("entries має бути масивом");
    return e;
  }
  const seen = new Map<string, number>();
  d.entries.forEach((x: Record<string, unknown>, i) => {
    if (!isStr(x?.lemma)) e.push(`запис ${i}: порожня lemma`);
    if (!isStr(x?.translation) || !/[Ѐ-ӿ]/.test(x.translation as string)) e.push(`запис ${i}: translation має бути українською`);
    if (!isStr(x?.transcription)) e.push(`запис ${i}: порожня transcription`);
    const forms = Array.isArray(x?.forms) ? (x.forms as unknown[]) : [];
    if (forms.length === 0 || !forms.every(isStr)) e.push(`запис ${i}: forms порожні або з порожнім елементом`);
    for (const f of forms.filter(isStr)) {
      const k = normForm(f);
      const prev = seen.get(k);
      if (prev !== undefined && prev !== i) e.push(`форма «${k}» у записах ${prev} і ${i}`);
      seen.set(k, i);
    }
  });
  return e;
}

export const emptyDict = (): DictIndex => ({ byForm: new Map(), untranslated: new Set() });

/** Індекс форма → запис (Map: записів багато). Файл має бути валідним. */
export function buildDictIndex(file: DictFile): DictIndex {
  const byForm = new Map<string, DictEntry>();
  for (const en of file.entries) for (const f of en.forms) byForm.set(normForm(f), en);
  return { byForm, untranslated: new Set(file.untranslated.map(normForm)) };
}

export function findInDict(index: DictIndex, form: string): DictEntry | null {
  return index.byForm.get(normForm(form)) ?? null;
}

/**
 * Читає словник через `read` (рядок файлу або null, якщо файлу нема). Немає файлу → порожній словник;
 * помилка читання, JSON чи схеми → `onError` і порожній словник (читання працює як без словника).
 */
export function loadDictionaryFrom(read: () => string | null, onError: (e: unknown) => void): DictIndex {
  try {
    const raw = read();
    if (raw === null) return emptyDict();
    const parsed: unknown = JSON.parse(raw);
    const errs = dictionaryErrors(parsed);
    if (errs.length) {
      onError(errs.slice(0, 3));
      return emptyDict();
    }
    return buildDictIndex(parsed as DictFile);
  } catch (e) {
    onError(e);
    return emptyDict();
  }
}

export type Coverage = {
  missing: { textId: string; word: string }[];
  uniqueWords: number;
  untranslatedRatio: number;
};

/**
 * Слово-токен кожного тексту має бути в глосарії цього тексту, словнику, `wordsSet` (нормалізовані слова data/words)
 * або `untranslated`. `untranslated` — явний список із файлу словника.
 */
export function coverage(texts: ReadingText[], dict: DictIndex, wordsSet: Set<string>, untranslated: string[]): Coverage {
  const skip = new Set(untranslated.map(normForm));
  const missing: Coverage["missing"] = [];
  const unique = new Set<string>();
  for (const t of texts) {
    const gl = new Set(t.glossary.flatMap((g) => g.forms.map(normForm)));
    const seen = new Set<string>();
    for (const tok of tokenize(t.text)) {
      if (!tok.word) continue;
      const w = normForm(tok.text);
      unique.add(w);
      if (seen.has(w)) continue;
      seen.add(w);
      if (gl.has(w) || dict.byForm.has(w) || wordsSet.has(w) || skip.has(w)) continue;
      missing.push({ textId: t.id, word: w });
    }
  }
  missing.sort((a, b) => a.textId.localeCompare(b.textId) || a.word.localeCompare(b.word));
  return { missing, uniqueWords: unique.size, untranslatedRatio: unique.size ? skip.size / unique.size : 0 };
}
