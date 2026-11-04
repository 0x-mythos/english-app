import { previewIntervals, type CardRow } from "@/lib/srs/fsrs";
import { cardKind, clozeOf } from "@/lib/srs/session";

// Рядок cards (+ слово з набору) → те, що бачить клієнт на картці.
export const CARD_FIELDS =
  "id, word, translation, example, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, " +
  "words(word, translation, transcription, example, set_name, topic)";

export type SessionRow = CardRow & {
  id: number;
  word: string | null;
  translation: string | null;
  example: string | null;
  words: { word: string; translation: string; transcription: string | null; example: string | null; set_name: string; topic: string | null } | null;
};

export function toSessionCard(r: SessionRow, now: Date) {
  const word = r.words?.word ?? r.word ?? "";
  const example = r.words?.example ?? r.example ?? null;
  const kind = cardKind(r.reps, r.id, example, word);
  return {
    id: r.id,
    kind,
    isNew: r.state === 0,
    word,
    translation: r.words?.translation ?? r.translation ?? "",
    transcription: r.words?.transcription ?? null,
    example,
    cloze: kind === "cloze" && example ? clozeOf(example, word) : null,
    set: r.words?.set_name ?? "own",
    intervals: previewIntervals(r, now),
  };
}
