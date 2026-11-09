// Які тексти бачить юзер і в якому порядку.
import type { ReadingText } from "./schema";

const ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** reading_level нижче B2 або відсутній → B1 і B2; B2 і вище → лише B2. */
export function levelsFor(readingLevel: string | null | undefined): string[] {
  const i = readingLevel ? ORDER.indexOf(readingLevel) : -1;
  return i >= ORDER.indexOf("B2") ? ["B2"] : ["B1", "B2"];
}

/** Тема тексту відповідає цілі юзера: `it` — будь-яка тема, крім everyday; `everyday` — everyday. */
export function matchesGoals(topic: string, goals: string[]): boolean {
  return goals.some((g) => (g === "everyday" ? topic === "everyday" : g === "it" ? topic !== "everyday" : false));
}

export function selectTexts(texts: ReadingText[], readingLevel: string | null | undefined, goals: string[]): ReadingText[] {
  const levels = levelsFor(readingLevel);
  return texts
    .filter((t) => levels.includes(t.level))
    .sort((a, b) => Number(matchesGoals(b.topic, goals)) - Number(matchesGoals(a.topic, goals)) || a.id.localeCompare(b.id));
}
