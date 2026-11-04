// Чисті правила сесії: скільки нових на день, з якого місця брати слова, як перемішати теми, який вигляд картки.
import type { Cefr } from "@/lib/placement/vocab";

export type CardKind = "recall" | "reverse" | "cloze";

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

/** Ліміти на день від часу, який юзер дав у тесті: ~1 нове слово на хвилину, повторів із запасом. */
export function dailyLimits(minutesPerDay: number) {
  const m = Math.min(Math.max(minutesPerDay, 5), 30);
  return { newPerDay: Math.min(m, 25), reviewsPerSession: m * 8 };
}

/** Everyday: слова з рангом, нижчим за оцінений словник, юзер найімовірніше знає — стартуємо трохи нижче межі. */
export function everydayStartRank(vocabSizeEst: number | null) {
  return Math.round((vocabSizeEst ?? 1500) * 0.8);
}

/** IT: рівні від «на один нижче за словник» і вище (A1/A2-слова в IT-наборі нічого не дають B1-юзеру). */
export function itCefrLevels(vocabCefr: Cefr | null): string[] {
  const i = CEFR_ORDER.indexOf(vocabCefr ?? "B1");
  return CEFR_ORDER.slice(Math.max(0, i - 1));
}

/** Перемішує групи по черзі (IT/everyday, теми всередині IT), зберігаючи порядок у кожній групі. */
export function interleave<T>(items: T[], groupOf: (x: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const x of items) {
    const g = groupOf(x);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(x);
  }
  const queues = [...groups.values()];
  const out: T[] = [];
  for (let i = 0; out.length < items.length; i++) {
    for (const q of queues) if (q[i] !== undefined) out.push(q[i]);
  }
  return out;
}

/**
 * Перші знайомства — «слово → переклад»; далі чергуємо, щоб і впізнавати, і згадувати слово з перекладу,
 * і бачити його в контексті. Пропуск у реченні лише коли слово справді є в прикладі.
 */
export function cardKind(reps: number, cardId: number, example: string | null, word: string): CardKind {
  if (reps < 2) return "recall";
  const kinds: CardKind[] = example && clozeOf(example, word) ? ["recall", "reverse", "cloze"] : ["recall", "reverse"];
  return kinds[(cardId + reps) % kinds.length];
}

/** Речення з пропуском замість слова (перше входження, без урахування регістру); null — слова в реченні нема. */
export function clozeOf(example: string, word: string): string | null {
  const i = example.toLowerCase().indexOf(word.toLowerCase());
  if (i < 0) return null;
  return example.slice(0, i) + "_____" + example.slice(i + word.length);
}

/** Чи правильно вписано слово в пропуск: без регістру, зайвих пробілів і розділових знаків по краях. */
export function clozeMatches(answer: string, word: string) {
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ").replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
  return norm(answer) === norm(word);
}

function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Локальна дата юзера 'YYYY-MM-DD'. */
export function localDate(now: Date, timeZone: string) {
  return localParts(now, timeZone).date;
}

/** Хвилини від локальної півночі. */
export function localMinutes(now: Date, timeZone: string) {
  return localParts(now, timeZone).minutes;
}

/** Момент локальної півночі як UTC-час (для «скільки нових карток створено сьогодні»). */
export function startOfLocalDay(now: Date, timeZone: string): Date {
  const { date, minutes } = localParts(now, timeZone);
  const approx = new Date(now.getTime() - minutes * 60_000 - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds());
  // після переходу на літній/зимовий час approx може зсунутись на годину — вирівнюємо до справжньої півночі
  const drift = localMinutes(approx, timeZone);
  const fixed = localDate(approx, timeZone) === date ? approx.getTime() - drift * 60_000 : approx.getTime() + (1440 - drift) * 60_000;
  return new Date(fixed);
}
