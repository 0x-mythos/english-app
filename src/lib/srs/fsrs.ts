// Обгортка над ts-fsrs: рядок `cards` ↔ Card, повтор → патч картки + рядок `review_logs`.
// Беремо легасі-API `fsrs()` (FSRS-6, синхронний); новий DefaultScheduler у v6 асинхронний і за замовчуванням FSRS-7.
import { fsrs, generatorParameters, Rating, State, type Card, type Grade } from "ts-fsrs";

export type CardRow = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
};

export const GRADES = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const;

const scheduler = fsrs(generatorParameters({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: true }));

export function isGrade(x: unknown): x is Grade {
  return GRADES.includes(x as Grade);
}

export function toCard(row: CardRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

function wholeDays(from: Date | undefined, to: Date) {
  return from ? Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000)) : 0;
}

/** Повтор картки: новий стан для `cards` і запис для `review_logs` (стан ДО повтору, як у FSRS-логах). */
export function review(row: CardRow, grade: Grade, now: Date) {
  const before = toCard(row);
  const { card, log } = scheduler.next(before, now, grade);
  const patch: CardRow = {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: wholeDays(before.last_review, now),
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: now.toISOString(),
  };
  const logRow = {
    rating: log.rating,
    state: log.state,
    due: log.due.toISOString(),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: wholeDays(before.last_review, now),
    scheduled_days: log.scheduled_days,
    learning_steps: log.learning_steps,
    reviewed_at: now.toISOString(),
  };
  return { patch, log: logRow };
}

/** Підписи на кнопках оцінки: через скільки картка повернеться при кожній оцінці. */
export function previewIntervals(row: CardRow, now: Date): Record<Grade, string> {
  const preview = scheduler.repeat(toCard(row), now);
  return Object.fromEntries(GRADES.map((g) => [g, formatInterval(preview[g].card.due.getTime() - now.getTime())])) as Record<
    Grade,
    string
  >;
}

export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} хв`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} год`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} дн`;
  const m = Math.round(d / 30);
  if (m < 12) return `${m} міс`;
  return `${Math.round(d / 365)} р`;
}
