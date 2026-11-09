// Пошук перекладу слова: глосарій тексту → рядки таблиці words → null. Без виклику Claude.

import { findInDict, type DictIndex } from "./dictionary";

export type GlossaryEntry = { lemma: string; forms: string[]; translation: string; transcription?: string };

export type WordRow = {
  id: number;
  word: string;
  translation: string;
  transcription: string | null;
  example: string | null;
  set_name: string;
};

export type Found = {
  source: "glossary" | "words" | "dictionary";
  form: string;
  lemma: string;
  translation: string;
  transcription: string | null;
  row: WordRow | null;
};

/** Порівняння форм слів: типографський апостроф → прямий, без регістру. */
export const normForm = (w: string) => w.replace(/[’‘`]/g, "'").trim().toLowerCase();

/** Спільне правило вибору рядка words, коли слово є в кількох наборах: спершу `it`, потім менший id. */
export function pickWordRow(rows: WordRow[]): WordRow | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => Number(b.set_name === "it") - Number(a.set_name === "it") || a.id - b.id)[0];
}

export function findGlossary(glossary: GlossaryEntry[], form: string): GlossaryEntry | null {
  const f = normForm(form);
  return glossary.find((g) => g.forms.some((x) => normForm(x) === f)) ?? null;
}

export function findTranslation(glossary: GlossaryEntry[], rows: WordRow[], form: string, dict?: DictIndex): Found | null {
  const g = findGlossary(glossary, form);
  if (g) return { source: "glossary", form, lemma: g.lemma, translation: g.translation, transcription: g.transcription ?? null, row: null };
  const f = normForm(form);
  const row = pickWordRow(rows.filter((r) => normForm(r.word) === f));
  if (row) return { source: "words", form, lemma: row.word, translation: row.translation, transcription: row.transcription, row };
  const d = dict ? findInDict(dict, form) : null;
  if (d) return { source: "dictionary", form, lemma: d.lemma, translation: d.translation, transcription: d.transcription, row: null };
  return null;
}
