// Граматичні дрили з власних помилок: які теми тренувати сьогодні, які вправи взяти, як перевірити відповідь.
// Чисті функції — БД і файли банку в drills-server.ts.

export type Level = "A2" | "B1" | "B2" | "C1";
export type ItemType = "choice" | "gap" | "fix";

export type BankItem = {
  id: string;
  level: Level;
  type: ItemType;
  prompt: string;
  options?: string[];
  answer?: number;
  answers?: string[];
  explanation: string;
};

export type BankTopic = { topic: string; title: string; rule: string; items: BankItem[] };

export type WeakTopic = { topic: string; score: number };
export type MistakeRow = { id: number; kind: string; topic: string; original: string; corrected: string; explanation: string | null; created_at: string };
export type AttemptRow = { item_id: string; topic: string; correct: boolean; created_at: string };

/** Вправа для клієнта — без правильних відповідей. 'own' = виправити власне речення з журналу помилок. */
export type DrillView = {
  id: string;
  type: ItemType | "own";
  topic: string;
  title: string;
  rule: string | null;
  prompt: string;
  options?: string[];
};

const LEVELS: Level[] = ["A2", "B1", "B2", "C1"];
const DAY = 86_400_000;

// Вільні теми від Claude (чат, письмо) → теми банку. Лексику не тренуємо тут — вона йде в картки.
const ALIASES: Record<string, string> = {
  article: "articles",
  preposition: "prepositions",
  comparative: "comparatives",
  superlatives: "comparatives",
  conditional: "conditionals",
  passive_voice: "passive",
  modal: "modals",
  modal_verbs: "modals",
  gerund: "gerund_infinitive",
  infinitive: "gerund_infinitive",
  reported: "reported_speech",
  indirect_speech: "reported_speech",
  relative_pronouns: "relative_clauses",
  questions: "question_forms",
  question_form: "question_forms",
  question_tags: "question_forms",
  countable_uncountable: "quantifiers",
  uncountable_nouns: "quantifiers",
  irregular_verbs: "verb_forms",
  subject_verb_agreement: "present_simple",
  third_person: "present_simple",
  past_tense: "past_simple",
  future: "future_forms",
  future_simple: "future_forms",
  present_perfect_continuous: "present_perfect",
};

/** Тема помилки → тема банку або null (лексика, правопис, невідоме). */
export function bankTopicOf(raw: string, known: Set<string>): string | null {
  const t = raw.toLowerCase().trim();
  if (known.has(t)) return t;
  const alias = ALIASES[t];
  if (alias && known.has(alias)) return alias;
  // "articles_with_nouns", "wrong_preposition" — шукаємо відому тему всередині
  for (const k of known) if (t.includes(k)) return k;
  for (const [a, k] of Object.entries(ALIASES)) if (t.includes(a) && known.has(k)) return k;
  return null;
}

export function drillsPerDay(minutesPerDay: number) {
  if (minutesPerDay <= 5) return 3;
  if (minutesPerDay <= 10) return 4;
  if (minutesPerDay <= 15) return 6;
  return 8;
}

// Без даних про помилки — найчастіші проблеми україномовних на B1.
const DEFAULT_TOPICS = ["articles", "present_perfect", "prepositions"];

/**
 * Пріоритет тем: слабкі теми тесту + свіжі помилки (згасають з півперіодом 14 днів)
 * + результати дрилів за 14 днів (помилки піднімають тему, правильні — опускають).
 */
export function topicPriorities(
  input: { weak: WeakTopic[]; mistakes: MistakeRow[]; attempts: AttemptRow[]; known: Set<string>; now: Date },
): string[] {
  const score = new Map<string, number>();
  const add = (topic: string | null, v: number) => {
    if (topic) score.set(topic, (score.get(topic) ?? 0) + v);
  };
  const now = input.now.getTime();

  for (const w of input.weak) add(bankTopicOf(w.topic, input.known), (1 - w.score) * 2);
  for (const m of input.mistakes) {
    if (m.kind !== "grammar") continue;
    const age = Math.max(0, now - Date.parse(m.created_at)) / DAY;
    add(bankTopicOf(m.topic, input.known), Math.pow(0.5, age / 14));
  }
  for (const a of input.attempts) {
    if (now - Date.parse(a.created_at) > 14 * DAY) continue;
    if (!input.known.has(a.topic) || !score.has(a.topic)) continue;
    add(a.topic, a.correct ? -0.3 : 0.5);
  }

  const ranked = [...score.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  return ranked.length ? ranked : DEFAULT_TOPICS.filter((t) => input.known.has(t));
}

type Rng = () => number;

function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Набір вправ на сьогодні: третина — власні речення з журналу помилок (ще не виправлені в дрилі),
 * решта — банк по 2–3 найпріоритетніших темах. Пропускаємо вправи, зроблені правильно за 30 днів;
 * спершу ті, де юзер помилявся, потім ближчі до його рівня.
 */
export function pickDrills(input: {
  bank: Map<string, BankTopic>;
  priorities: string[];
  mistakes: MistakeRow[];
  attempts: AttemptRow[];
  level: Level | null;
  limit: number;
  now: Date;
  /** вже показані сьогодні — не повторюємо в тій же сесії */
  exclude?: Set<string>;
  rng?: Rng;
}): DrillView[] {
  const rng = input.rng ?? Math.random;
  const { limit, now } = input;
  if (limit <= 0) return [];

  const doneRecently = new Set<string>(input.exclude ?? []);
  const everCorrect = new Set<string>();
  const wrong = new Set<string>();
  for (const a of input.attempts) {
    if (a.correct) {
      everCorrect.add(a.item_id);
      if (now.getTime() - Date.parse(a.created_at) <= 30 * DAY) doneRecently.add(a.item_id);
    } else wrong.add(a.item_id);
  }

  const own: DrillView[] = input.mistakes
    .filter((m) => m.kind === "grammar" && m.original.trim() && m.original.length <= 200 && norm(m.original) !== norm(m.corrected))
    .filter((m) => !everCorrect.has(`m${m.id}`) && !doneRecently.has(`m${m.id}`))
    .slice(0, Math.ceil(limit / 3))
    .map((m) => {
      const topic = bankTopicOf(m.topic, new Set(input.bank.keys())) ?? m.topic;
      return { id: `m${m.id}`, type: "own", topic, title: input.bank.get(topic)?.title ?? "Твоя помилка", rule: null, prompt: m.original };
    });

  const topics = input.priorities.filter((t) => input.bank.has(t)).slice(0, limit >= 8 ? 3 : 2);
  const fromBank: DrillView[][] = [];
  let left = limit - own.length;
  topics.forEach((t, i) => {
    const per = Math.ceil(left / (topics.length - i));
    const bt = input.bank.get(t)!;
    const userLvl = LEVELS.indexOf(input.level ?? "B1");
    const pool = shuffle(bt.items.filter((x) => !doneRecently.has(x.id)), rng)
      .sort((a, b) => Number(wrong.has(b.id)) - Number(wrong.has(a.id))
        || Math.abs(LEVELS.indexOf(a.level) - userLvl) - Math.abs(LEVELS.indexOf(b.level) - userLvl));
    const chosen = pool.slice(0, per).map((x) => toView(bt, x));
    left -= chosen.length;
    fromBank.push(chosen);
  });

  // перемішуємо теми між собою (interleaving краще за блоки), власні речення — рівномірно між ними
  const mixed: DrillView[] = [];
  while (fromBank.some((q) => q.length)) for (const q of fromBank) if (q.length) mixed.push(q.shift()!);
  const step = Math.max(1, Math.floor(mixed.length / (own.length + 1)));
  own.forEach((o, i) => mixed.splice(Math.min(mixed.length, (i + 1) * step + i), 0, o));
  return mixed.slice(0, limit);
}

function toView(t: BankTopic, x: BankItem): DrillView {
  return {
    id: x.id, type: x.type, topic: t.topic, title: t.title, rule: t.rule, prompt: x.prompt,
    ...(x.type === "choice" ? { options: x.options } : {}),
  };
}

/** Нормалізація для порівняння вільної відповіді: регістр, апострофи, пробіли, кінцева пунктуація. */
export function norm(s: string) {
  return s.toLowerCase().trim()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/[.!?]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type Checked = { correct: boolean; expected: string; explanation: string | null };

/** Перевірка відповіді на вправу банку. choice — індекс варіанта рядком. */
export function checkBankAnswer(item: BankItem, answer: string): Checked {
  if (item.type === "choice") {
    const expected = item.options![item.answer!];
    return { correct: Number(answer) === item.answer, expected, explanation: item.explanation };
  }
  const accepted = item.answers ?? [];
  return { correct: accepted.some((a) => norm(a) === norm(answer)), expected: accepted[0], explanation: item.explanation };
}

/** Власне речення: порівнюємо з виправленим варіантом із журналу. */
export function checkOwnAnswer(m: Pick<MistakeRow, "corrected" | "explanation">, answer: string): Checked {
  return { correct: norm(m.corrected) === norm(answer), expected: m.corrected, explanation: m.explanation };
}

/** Схема банку — перевіряє тест і завантажувач (зіпсований файл не має зламати сесію). */
export function bankErrors(t: BankTopic): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  if (!t.topic || !t.title || !t.rule || !Array.isArray(t.items)) return [`${t.topic}: шапка`];
  for (const x of t.items) {
    const at = `${t.topic}/${x.id}`;
    if (!x.id?.startsWith(`${t.topic}-`) || ids.has(x.id)) errs.push(`${at}: id`);
    ids.add(x.id);
    if (!LEVELS.includes(x.level)) errs.push(`${at}: level`);
    if (!x.explanation) errs.push(`${at}: explanation`);
    if (x.type === "choice" || x.type === "gap") {
      if (x.prompt.split("___").length !== 2) errs.push(`${at}: має бути рівно один ___`);
    }
    if (x.type === "choice") {
      const o = x.options ?? [];
      if (o.length < 3 || o.length > 4 || new Set(o).size !== o.length) errs.push(`${at}: options`);
      if (!Number.isInteger(x.answer) || x.answer! < 0 || x.answer! >= o.length) errs.push(`${at}: answer`);
    } else if (x.type === "gap" || x.type === "fix") {
      if (!x.answers?.length || x.answers.some((a) => !a.trim())) errs.push(`${at}: answers`);
      if (x.type === "fix" && x.answers?.some((a) => norm(a) === norm(x.prompt))) errs.push(`${at}: fix без помилки`);
    } else errs.push(`${at}: type`);
  }
  return errs;
}
