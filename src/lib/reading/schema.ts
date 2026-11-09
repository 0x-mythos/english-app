// Схема файла тексту `data/reading/<id>.json` і її перевірка (формат — у спеці етапу 6, розділ «Контракти»).
import { normForm, type GlossaryEntry } from "./lookup";
import { tokenize } from "./tokenize";

export type { GlossaryEntry };
export type ReadingQuestion = { prompt: string; options: string[]; answer: number; explanation: string };
export type ReadingText = {
  id: string;
  level: "B1" | "B2";
  topic: string;
  title: string;
  text: string;
  glossary: GlossaryEntry[];
  questions: ReadingQuestion[];
};

export const READING_LEVELS = ["B1", "B2"];
/** Дозволені теми (як у data/reading/SPEC.md); `everyday` — єдина не-IT тема. */
export const READING_TOPICS = ["code_review", "api", "devops", "meetings", "interview", "data", "general_it", "everyday"];
export const MIN_WORDS = 120;
export const MAX_WORDS = 220;

export const wordCount = (text: string) => tokenize(text).filter((t) => t.word).length;

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Список помилок схеми (порожній = файл валідний). `fileId` — ім'я файла без .json. */
export function textErrors(raw: unknown, fileId: string): string[] {
  const e: string[] = [];
  if (!raw || typeof raw !== "object") return ["не об'єкт"];
  const t = raw as Record<string, unknown>;
  if (!isStr(t.id) || t.id !== fileId) e.push(`id «${String(t.id)}» не збігається з іменем файлу «${fileId}»`);
  if (!READING_LEVELS.includes(t.level as string)) e.push("level має бути B1 або B2");
  if (!READING_TOPICS.includes(t.topic as string)) e.push(`topic «${String(t.topic)}» не з дозволеного списку`);
  if (!isStr(t.title)) e.push("порожній title");
  if (!isStr(t.text)) {
    e.push("порожній text");
    return e;
  }

  const n = wordCount(t.text);
  if (n < MIN_WORDS || n > MAX_WORDS) e.push(`слів ${n}, треба ${MIN_WORDS}–${MAX_WORDS}`);

  const qs = t.questions;
  if (!Array.isArray(qs) || qs.length < 2 || qs.length > 3) e.push("питань має бути 2–3");
  else {
    qs.forEach((q: Record<string, unknown>, i) => {
      const opts = Array.isArray(q?.options) ? (q.options as unknown[]) : [];
      if (!isStr(q?.prompt)) e.push(`питання ${i}: порожній prompt`);
      if (opts.length < 3 || opts.length > 4 || !opts.every(isStr)) e.push(`питання ${i}: варіантів має бути 3–4 непорожніх`);
      else if (new Set(opts.map((o) => String(o).trim().toLowerCase())).size !== opts.length) e.push(`питання ${i}: варіанти не різні`);
      if (!Number.isInteger(q?.answer) || (q.answer as number) < 0 || (q.answer as number) >= opts.length) e.push(`питання ${i}: answer поза межами`);
      if (!isStr(q?.explanation)) e.push(`питання ${i}: порожнє explanation`);
    });
  }

  const gl = t.glossary;
  if (!Array.isArray(gl) || gl.length < 1) e.push("глосарій порожній");
  else {
    const inText = new Set(tokenize(t.text).filter((x) => x.word).map((x) => normForm(x.text)));
    const seen = new Set<string>();
    gl.forEach((g: Record<string, unknown>, i) => {
      if (!isStr(g?.lemma)) e.push(`глосарій ${i}: порожня lemma`);
      if (!isStr(g?.translation) || !/[Ѐ-ӿ]/.test(g.translation as string)) e.push(`глосарій ${i}: translation має бути українською`);
      const forms = Array.isArray(g?.forms) ? (g.forms as unknown[]) : [];
      if (forms.length === 0 || !forms.every(isStr)) e.push(`глосарій ${i}: forms порожні`);
      for (const f of forms.filter(isStr)) {
        const k = normForm(f);
        if (!inText.has(k)) e.push(`глосарій ${i}: форма «${f}» не трапляється в тексті`);
        if (seen.has(k)) e.push(`глосарій ${i}: форма «${f}» повторюється`);
        seen.add(k);
      }
    });
  }
  return e;
}
