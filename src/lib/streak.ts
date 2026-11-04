// М'який стрік: день зараховано, якщо був хоч один повтор. Пропуски покриваються заморозками (без «почуття провини»):
// старт з 1 заморозкою, +1 за кожні 7 днів поспіль, максимум 2. Дати — локальні 'YYYY-MM-DD' юзера.

export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 7;

export type Streak = { current: number; best: number; freezes: number; last_active: string | null };
export type StreakView = { current: number; best: number; freezes: number; doneToday: boolean; frozenDays: number };

export const EMPTY_STREAK: Streak = { current: 0, best: 0, freezes: 1, last_active: null };

/** Різниця в днях між локальними датами (b − a). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Нова версія стріку після активності сьогодні. Повторний виклик того ж дня нічого не змінює. */
export function applyActivity(s: Streak, today: string): Streak {
  if (s.last_active === today) return s;
  let { current, freezes } = s;
  const missed = s.last_active ? daysBetween(s.last_active, today) - 1 : Infinity;

  if (missed < 0) return s; // годинник/пояс відкотився — не чіпаємо
  if (missed === 0) current += 1;
  else if (missed <= freezes) {
    freezes -= missed;
    current += 1;
  } else current = 1;

  if (current % FREEZE_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
  return { current, best: Math.max(s.best, current), freezes, last_active: today };
}

/** Що показати сьогодні (до активності): стрік живий, якщо пропущені дні вміщаються в заморозки. */
export function viewStreak(s: Streak, today: string): StreakView {
  const base = { best: s.best, freezes: s.freezes };
  if (!s.last_active) return { ...base, current: 0, doneToday: false, frozenDays: 0 };
  const gap = daysBetween(s.last_active, today);
  if (gap <= 0) return { ...base, current: s.current, doneToday: gap === 0, frozenDays: 0 };
  const missed = gap - 1;
  if (missed <= s.freezes) return { ...base, current: s.current, doneToday: false, frozenDays: missed };
  return { ...base, current: 0, doneToday: false, frozenDays: 0 };
}
