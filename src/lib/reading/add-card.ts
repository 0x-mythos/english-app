// Створення картки з читання. Сховище — інтерфейс, щоб логіку (лема, дубль, example) можна було тестувати без БД.
import type { CardPlan } from "./card";
import type { WordRow } from "./lookup";

export type StoredCard = { word: string; translation: string; transcription: string | null; example: string | null; wordId?: number | null };

export type CardStore = {
  /** Картка юзера з таким словом (власна або з набору), без регістру. */
  findUserCard(word: string): Promise<StoredCard | null>;
  insertWordCard(row: WordRow, example: string): Promise<void>;
  insertOwnCard(card: { word: string; translation: string; transcription: string | null; example: string }): Promise<void>;
};

export type AddCardResult = {
  status: "added" | "exists";
  card: { word: string; translation: string; transcription: string; example: string };
};

const info = (c: StoredCard): AddCardResult["card"] => ({
  word: c.word, translation: c.translation, transcription: c.transcription ?? "", example: c.example ?? "",
});

/** Глосарій і словник → власна картка за лемою (`deployed` → `deploy`); words → картка з word_id; в обох example = речення з тексту. Дубль → exists. */
export async function runAddReadingCard(store: CardStore, plan: CardPlan): Promise<AddCardResult> {
  const key = plan.kind === "words" ? plan.row.word : plan.lemma;
  const existing = await store.findUserCard(key);
  if (existing) return { status: "exists", card: info(existing) };

  if (plan.kind === "words") {
    await store.insertWordCard(plan.row, plan.sentence);
    return { status: "added", card: info({ ...plan.row, example: plan.sentence }) };
  }
  const card = { word: plan.lemma, translation: plan.translation, transcription: plan.transcription, example: plan.sentence };
  await store.insertOwnCard(card);
  return { status: "added", card: info(card) };
}
