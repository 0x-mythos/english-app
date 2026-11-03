// Адаптивна граматика: старт B1, правильно → рівень вгору, неправильно → вниз. Сервер stateless: стан = історія відповідей.

export const LEVELS = ["A2", "B1", "B2", "C1"] as const;
export type GrammarLevel = (typeof LEVELS)[number];

export type GrammarQuestion = {
  id: string;
  level: GrammarLevel;
  topic: string;
  prompt: string; // ___ = пропуск
  options: string[];
  answer: number;
};

export type PublicQuestion = Omit<GrammarQuestion, "answer" | "level">;
export type Answer = { id: string; choice: number };

export const GRAMMAR_QUESTIONS_TOTAL = 12;
const START: GrammarLevel = "B1";

const q = (id: string, level: GrammarLevel, topic: string, prompt: string, options: string[], answer: number): GrammarQuestion => ({
  id, level, topic, prompt, options, answer,
});

export const GRAMMAR_BANK: GrammarQuestion[] = [
  q("a2-1", "A2", "past_simple", "Yesterday I ___ to the office by bike.", ["go", "went", "gone", "have gone"], 1),
  q("a2-2", "A2", "present_simple", "She ___ coffee every morning before work.", ["drink", "drinks", "is drink", "drinking"], 1),
  q("a2-3", "A2", "comparatives", "This laptop is ___ than my old one.", ["fast", "more fast", "faster", "fastest"], 2),
  q("a2-4", "A2", "prepositions", "The meeting starts ___ 10 o'clock.", ["in", "on", "at", "by"], 2),
  q("a2-5", "A2", "articles", "I'm looking for ___ job in IT.", ["a", "an", "the", "—"], 0),
  q("a2-6", "A2", "present_continuous", "Be quiet, please — I ___ on a call.", ["am", "is being", "am being", "have"], 0),
  q("a2-7", "A2", "future_forms", "Look at those clouds! It ___ rain.", ["is going to", "goes to", "will to", "is raining to"], 0),

  q("b1-1", "B1", "present_perfect", "I ___ this bug three times already today.", ["fixed", "have fixed", "am fixing", "had fix"], 1),
  q("b1-2", "B1", "present_perfect", "We ___ in this project since March.", ["work", "are working", "have been working", "worked"], 2),
  q("b1-3", "B1", "conditionals", "If the tests ___, we will deploy tonight.", ["pass", "will pass", "passed", "would pass"], 0),
  q("b1-4", "B1", "passive", "The new feature ___ by our team last week.", ["released", "was released", "has releasing", "is release"], 1),
  q("b1-5", "B1", "articles", "___ database we use is PostgreSQL.", ["A", "An", "The", "—"], 2),
  q("b1-6", "B1", "modals", "You ___ commit your API keys to the repo — it's dangerous.", ["mustn't", "don't have to", "needn't", "couldn't"], 0),
  q("b1-7", "B1", "gerund_infinitive", "I enjoy ___ new technologies.", ["learn", "to learn", "learning", "learned"], 2),

  q("b2-1", "B2", "conditionals", "If I ___ about the outage, I would have called you.", ["knew", "had known", "have known", "would know"], 1),
  q("b2-2", "B2", "reported_speech", "She told me she ___ the report the next day.", ["will send", "would send", "sends", "has sent"], 1),
  q("b2-3", "B2", "relative_clauses", "The developer ___ code I reviewed is very talented.", ["who", "which", "whose", "whom"], 2),
  q("b2-4", "B2", "passive", "The servers ___ right now, so the site is down.", ["are updating", "are being updated", "have updated", "being updated"], 1),
  q("b2-5", "B2", "gerund_infinitive", "I remember ___ the door, but now it's open.", ["to lock", "locking", "lock", "locked"], 1),
  q("b2-6", "B2", "modals", "He ___ have left already — his laptop is still here.", ["can't", "mustn't", "shouldn't", "needn't"], 0),
  q("b2-7", "B2", "wish", "I wish I ___ more time to finish this sprint.", ["have", "had", "will have", "would had"], 1),

  q("c1-1", "C1", "inversion", "Not only ___ the deadline, but he also broke the build.", ["he missed", "did he miss", "he did miss", "missed he"], 1),
  q("c1-2", "C1", "inversion", "Hardly ___ the release when users started reporting bugs.", ["we had shipped", "had we shipped", "we shipped", "did we shipped"], 1),
  q("c1-3", "C1", "conditionals", "___ you need any help, just let me know.", ["Should", "Would", "Had", "Were"], 0),
  q("c1-4", "C1", "subjunctive", "It's essential that every request ___ authenticated.", ["is being", "be", "will be", "was"], 1),
  q("c1-5", "C1", "modals", "You ___ told me the API was deprecated — I spent a day on it!", ["should have", "must have", "could", "would"], 0),
  q("c1-6", "C1", "articles", "She has ___ remarkable ability to explain complex things simply.", ["the", "a", "—", "an"], 1),
  q("c1-7", "C1", "cleft_sentences", "___ I really need is a clear specification.", ["That", "Which", "What", "It"], 2),
];

const byId = new Map(GRAMMAR_BANK.map((x) => [x.id, x]));

export function toPublic({ id, topic, prompt, options }: GrammarQuestion): PublicQuestion {
  return { id, topic, prompt, options };
}

/** Перевіряє історію з клієнта: відомі id, без повторів, choice у межах варіантів, не довша за ліміт. */
export function validateHistory(history: unknown): history is Answer[] {
  if (!Array.isArray(history) || history.length > GRAMMAR_QUESTIONS_TOTAL) return false;
  const seen = new Set<string>();
  for (const a of history) {
    const question = typeof a?.id === "string" ? byId.get(a.id) : undefined;
    if (!question || seen.has(a.id)) return false;
    if (!Number.isInteger(a.choice) || a.choice < 0 || a.choice >= question.options.length) return false;
    seen.add(a.id);
  }
  return true;
}

function isCorrect(a: Answer) {
  return byId.get(a.id)!.answer === a.choice;
}

/** Поточний рівень після історії: кожна правильна відповідь +1 рівень, неправильна −1, у межах A2..C1. */
export function currentLevel(history: Answer[]): GrammarLevel {
  let i = LEVELS.indexOf(START);
  for (const a of history) i = Math.min(LEVELS.length - 1, Math.max(0, i + (isCorrect(a) ? 1 : -1)));
  return LEVELS[i];
}

/** Наступне питання поточного рівня; якщо там закінчились — з найближчого рівня. null = тест завершено. */
export function nextQuestion(history: Answer[]): GrammarQuestion | null {
  if (history.length >= GRAMMAR_QUESTIONS_TOTAL) return null;
  const answered = new Set(history.map((a) => a.id));
  const target = LEVELS.indexOf(currentLevel(history));
  const order = [...LEVELS.keys()].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || b - a);
  for (const li of order) {
    const found = GRAMMAR_BANK.find((x) => x.level === LEVELS[li] && !answered.has(x.id));
    if (found) return found;
  }
  return null;
}

export type GrammarResult = {
  level: GrammarLevel;
  correct: number;
  total: number;
  weakTopics: { topic: string; score: number }[];
};

/** Рівень = найвищий, де ≥60% правильних при ≥2 відповідях; інакше A2. Слабкі теми — де є помилки. */
export function scoreGrammar(history: Answer[]): GrammarResult {
  let level: GrammarLevel = "A2";
  for (const lvl of LEVELS) {
    const atLevel = history.filter((a) => byId.get(a.id)!.level === lvl);
    if (atLevel.length >= 2 && atLevel.filter(isCorrect).length / atLevel.length >= 0.6) level = lvl;
  }

  const topics = new Map<string, { ok: number; all: number }>();
  for (const a of history) {
    const t = byId.get(a.id)!.topic;
    const s = topics.get(t) ?? { ok: 0, all: 0 };
    s.all++;
    if (isCorrect(a)) s.ok++;
    topics.set(t, s);
  }
  const weakTopics = [...topics]
    .filter(([, s]) => s.ok < s.all)
    .map(([topic, s]) => ({ topic, score: Math.round((s.ok / s.all) * 100) / 100 }))
    .sort((a, b) => a.score - b.score);

  return { level, correct: history.filter(isCorrect).length, total: history.length, weakTopics };
}
