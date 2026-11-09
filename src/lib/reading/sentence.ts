// Речення-контекст: те, де натиснули слово. Без перекладу, до 300 символів.

export const SENTENCE_MAX = 300;

export const normSpaces = (s: string) => s.trim().replace(/\s+/g, " ");

/** Речення, що містить символ за зсувом `offset`: межі — кінець речення (.!?) + пробіл або перенос рядка/абзац. */
export function sentenceAt(text: string, offset: number): string {
  const before = text.slice(0, offset);
  const after = text.slice(offset);
  const bounds = /[.!?]["')\]]*\s+|\n+/g;
  let start = 0;
  for (const m of before.matchAll(bounds)) start = m.index + m[0].length;
  const endM = /[.!?]["')\]]*(?=\s|$)|\n/.exec(after);
  const end = endM ? offset + endM.index + endM[0].length : text.length;
  const raw = text.slice(start, end);
  const s = raw.trim();
  if (s.length <= SENTENCE_MAX) return s;
  // довге речення: вікно в 300 символів навколо слова
  const rel = offset - (start + (raw.length - raw.trimStart().length));
  const from = Math.max(0, Math.min(rel - 100, s.length - SENTENCE_MAX));
  return s.slice(from, from + SENTENCE_MAX);
}

/** Стискає речення до ≤300 символів вікном, що містить позицію `idx` (підрядок початкового). */
export function clipAround(s: string, idx: number): string {
  if (s.length <= SENTENCE_MAX) return s;
  const from = Math.max(0, Math.min(idx - 100, s.length - SENTENCE_MAX));
  return s.slice(from, from + SENTENCE_MAX);
}
