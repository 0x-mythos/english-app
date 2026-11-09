// Токенізатор тексту для читання: слово = літери з внутрішніми апострофом/дефісом (don't, roll-back, API's).
// Числа й розділові знаки — не слова. Склеювання текстів токенів дає початковий рядок.

export type Token = { text: string; word: boolean; start: number };

const WORD = /\p{L}+(?:['’-]\p{L}+)*/gu;

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let pos = 0;
  for (const m of text.matchAll(WORD)) {
    if (m.index > pos) out.push({ text: text.slice(pos, m.index), word: false, start: pos });
    out.push({ text: m[0], word: true, start: m.index });
    pos = m.index + m[0].length;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), word: false, start: pos });
  return out;
}
