// Тест словника «так/ні» (Meara): справжні слова з 10 частотних діапазонів + псевдослова, щоб ловити вгадування.

export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1";

type VocabItem = { id: string; word: string; band: number | null }; // band null = псевдослово

const BANDS: string[][] = [
  ["house", "believe", "morning", "simple"],
  ["borrow", "weather", "honest", "surface"],
  ["abroad", "convince", "frequent", "harvest"],
  ["reluctant", "gossip", "overwhelm", "timber"],
  ["shrewd", "wrinkle", "adjacent", "mundane"],
  ["hinder", "lavish", "novice", "scrutiny"],
  ["brittle", "elated", "frugal", "dwindle"],
  ["nimble", "sullen", "prodigy", "wistful"],
  ["rebuke", "fickle", "candor", "squalid"],
  ["obsequious", "quagmire", "truculent", "lethargy"],
];

const PSEUDO = ["blonter", "mafler", "purkish", "snovel", "dravity", "cronder", "flimbate", "pelorant", "stribule", "haspery"];

// id непрозорий (хеш слова), щоб з нього не читались діапазон чи «вигаданість»
export const VOCAB_ITEMS: VocabItem[] = [
  ...BANDS.flatMap((words, b) => words.map((word) => ({ id: wordId(word), word, band: b + 1 }))),
  ...PSEUDO.map((word) => ({ id: wordId(word), word, band: null })),
];

function wordId(word: string) {
  return `w${hash(`vocab:${word}`).toString(36)}`;
}

/** Те, що бачить клієнт: без позначки, яке слово вигадане. Порядок перемішаний детерміновано. */
export function publicVocabItems(): { id: string; word: string }[] {
  return [...VOCAB_ITEMS]
    .sort((a, b) => hash(a.word) - hash(b.word))
    .map(({ id, word }) => ({ id, word }));
}

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Оцінка розміру словника: Σ по діапазонах (h−f)/(1−f)·1000, f — частка «так» на псевдословах. */
export function scoreVocab(known: Record<string, boolean>): { size: number; cefr: Cefr; falseAlarm: number } {
  const pseudo = VOCAB_ITEMS.filter((i) => i.band === null);
  const f = pseudo.filter((i) => known[i.id]).length / pseudo.length;

  let size = 0;
  for (let band = 1; band <= BANDS.length; band++) {
    const items = VOCAB_ITEMS.filter((i) => i.band === band);
    const h = items.filter((i) => known[i.id]).length / items.length;
    const adjusted = f >= 1 ? 0 : Math.max(0, (h - f) / (1 - f));
    size += adjusted * 1000;
  }
  size = Math.round(size);
  return { size, cefr: vocabCefr(size), falseAlarm: f };
}

export function vocabCefr(size: number): Cefr {
  if (size < 1000) return "A1";
  if (size < 2000) return "A2";
  if (size < 3250) return "B1";
  if (size < 5000) return "B2";
  return "C1";
}
