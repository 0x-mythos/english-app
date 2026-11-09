// «+» у читанні: перевіряємо запит і будуємо план картки. Переклад беремо лише на сервері (глосарій тексту або words).
import { normalizeOwnWord } from "../own-word";
import { wholeWordMatch } from "../srs/session";
import { findInDict, type DictIndex } from "./dictionary";
import { findGlossary, normForm, pickWordRow, type WordRow } from "./lookup";
import type { ReadingText } from "./schema";
import { clipAround, normSpaces } from "./sentence";
import { parseCardBody } from "./views";

export type CardPlan =
  | { kind: "glossary"; form: string; lemma: string; translation: string; transcription: string | null; sentence: string }
  | { kind: "words"; form: string; row: WordRow; sentence: string }
  | { kind: "dictionary"; form: string; lemma: string; translation: string; transcription: string; sentence: string };

export type PrepareResult = { status: "not_found" | "invalid" } | { status: "ok"; plan: CardPlan };

/**
 * not_found → 404 (невідомий textId); invalid → 422 (кривий запит, речення не з цього тексту,
 * речення без натиснутої форми, слово ні з глосарію цього тексту, ні з words).
 * `rows` — рядки words для слова (ilike); `lemmaRows` — рядки words для леми словника, якщо вона інша; вибір одного — pickWordRow.
 */
export function prepareCard(text: ReadingText | undefined, raw: unknown, rows: WordRow[], dict?: DictIndex, lemmaRows: WordRow[] = []): PrepareResult {
  const body = parseCardBody(raw);
  if (!body) return { status: "invalid" };
  if (!text) return { status: "not_found" };

  const full = normSpaces(body.sentence);
  if (!full || !normSpaces(text.text).includes(full)) return { status: "invalid" };

  const form = normalizeOwnWord(body.word);
  if (!form || form.includes(" ")) return { status: "invalid" };
  const at = wholeWordMatch(full, form);
  if (!at) return { status: "invalid" };
  const sentence = clipAround(full, at.index);

  const g = findGlossary(text.glossary, form);
  if (g) return { status: "ok", plan: { kind: "glossary", form, lemma: g.lemma, translation: g.translation, transcription: g.transcription ?? null, sentence } };

  const f = normForm(form);
  const row = pickWordRow(rows.filter((r) => normForm(r.word) === f));
  if (row) return { status: "ok", plan: { kind: "words", form, row, sentence } };
  const d = dict ? findInDict(dict, form) : null;
  if (!d) return { status: "invalid" };
  const lemmaKey = normForm(d.lemma);
  const lemmaRow = pickWordRow([...rows, ...lemmaRows].filter((r) => normForm(r.word) === lemmaKey));
  if (lemmaRow) return { status: "ok", plan: { kind: "words", form, row: lemmaRow, sentence } };
  return { status: "ok", plan: { kind: "dictionary", form, lemma: d.lemma, translation: d.translation, transcription: d.transcription, sentence } };
}
