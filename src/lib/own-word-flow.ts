// Послідовність «свого слова» без БД і Claude (залежності передаються), щоб порядок «дубль → набір → ліміт → Claude» був під тестом.
import { normalizeContext, normalizeOwnWord, type OwnWordInfo } from "./own-word";

export type AddOwnWordResult =
  | { status: "added" | "exists"; card: OwnWordInfo }
  | { status: "invalid" | "not_a_word" | "ai_error" | "limit" };

export type FoundCard = { word: string; translation: string; transcription: string | null; example: string | null };

export type OwnWordDeps = {
  findUserCard(word: string): Promise<FoundCard | null>;
  addFromSet(word: string): Promise<OwnWordInfo | null>;
  askClaude(word: string, context: string | null): Promise<OwnWordInfo | "not_a_word" | "ai_error">;
  insertCard(card: OwnWordInfo): Promise<void>;
  /** true — виклик Claude дозволено і зараховано; false — денний ліміт. */
  takeLimit(userId: string): Promise<boolean>;
};

export const cardInfo = (f: FoundCard): OwnWordInfo => ({
  word: f.word,
  translation: f.translation,
  transcription: f.transcription ?? "",
  example: f.example ?? "",
});

export async function runAddOwnWord(deps: OwnWordDeps, userId: string, rawWord: unknown, rawContext?: unknown): Promise<AddOwnWordResult> {
  const word = normalizeOwnWord(rawWord);
  if (!word) return { status: "invalid" };
  const context = normalizeContext(rawContext);

  const existing = await deps.findUserCard(word);
  if (existing) return { status: "exists", card: cardInfo(existing) };
  const fromSet = await deps.addFromSet(word);
  if (fromSet) return { status: "added", card: fromSet };

  // ліміт — прямо перед Claude; рахується кожен виклик, зокрема not_a_word і ai_error
  if (!(await deps.takeLimit(userId))) return { status: "limit" };
  const ai = await deps.askClaude(word, context);
  if (typeof ai === "string") return { status: ai };

  // Claude міг виправити написання/привести до леми — перевіряємо ще раз уже нормальну форму
  if (ai.word.toLowerCase() !== word.toLowerCase()) {
    const again = await deps.findUserCard(ai.word);
    if (again) return { status: "exists", card: cardInfo(again) };
    const set2 = await deps.addFromSet(ai.word);
    if (set2) return { status: "added", card: set2 };
  }

  await deps.insertCard(ai);
  return { status: "added", card: ai };
}
