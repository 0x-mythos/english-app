// Що віддаємо клієнту й як розбираємо його запити (чисті функції; роути лише викликають їх).
import { normalizeOwnWord } from "../own-word";
import { wordCount, type ReadingText } from "./schema";

export const LOOKUP_MAX_CHARS = 40;

export function listItems(texts: ReadingText[]) {
  return texts.map((t) => ({ id: t.id, title: t.title, level: t.level, topic: t.topic, words: wordCount(t.text) }));
}

/** Текст для екрана читання: питання без answer/explanation. */
export function textView(t: ReadingText) {
  return {
    id: t.id,
    title: t.title,
    level: t.level,
    topic: t.topic,
    text: t.text,
    questions: t.questions.map((q) => ({ prompt: q.prompt, options: q.options })),
  };
}

/** Пошук лише в Map завантажених файлів: жодних шляхів із id. */
export function findText(texts: Map<string, ReadingText>, id: unknown): ReadingText | undefined {
  return typeof id === "string" && texts.has(id) ? texts.get(id) : undefined;
}

/** `w` з query → нормалізоване слово; null (не слово, порожньо або >40 символів) → 422. */
export function parseLookupWord(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > LOOKUP_MAX_CHARS) return null;
  const w = normalizeOwnWord(raw);
  return w && w.length <= LOOKUP_MAX_CHARS ? w : null;
}

export function parseAnswerBody(raw: unknown): { id: string; answers: unknown[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as { id?: unknown; answers?: unknown };
  if (typeof b.id !== "string" || !Array.isArray(b.answers)) return null;
  return { id: b.id, answers: b.answers };
}

export type AnswerResult = { correct: number; total: number; results: { correct: boolean; answer: number; explanation: string }[] };

/** Перевірка відповідей на сервері. null — кривий формат (довжина, не цілі, поза межами). */
export function gradeAnswers(t: ReadingText, answers: unknown): AnswerResult | null {
  if (!Array.isArray(answers) || answers.length !== t.questions.length) return null;
  const results: AnswerResult["results"] = [];
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    const q = t.questions[i];
    if (!Number.isInteger(a) || (a as number) < 0 || (a as number) >= q.options.length) return null;
    results.push({ correct: a === q.answer, answer: q.answer, explanation: q.explanation });
  }
  return { correct: results.filter((r) => r.correct).length, total: results.length, results };
}

export type CardBody = { textId: string; word: string; sentence: string };

export function parseCardBody(raw: unknown): CardBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.textId !== "string" || typeof b.word !== "string" || typeof b.sentence !== "string") return null;
  return { textId: b.textId, word: b.word, sentence: b.sentence };
}
