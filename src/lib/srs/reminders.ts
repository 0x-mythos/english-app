// Коли боту нагадувати: раз на день, після remind_at за локальним часом юзера, і лише якщо сьогодні ще не займався.
import { localDate, localMinutes } from "./session";

export type ReminderUser = {
  reminders_on: boolean;
  remind_at: string; // 'HH:MM' або 'HH:MM:SS' з Postgres time
  timezone: string;
  last_reminded_on: string | null;
};

export function parseTime(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Нагадування не пізніше ніж за 3 год після remind_at: якщо сервер лежав, о 2-й ночі не пишемо. */
const LATE_WINDOW_MIN = 180;

export function shouldRemind(u: ReminderUser, now: Date, studiedToday: boolean): boolean {
  if (!u.reminders_on || studiedToday) return false;
  const at = parseTime(u.remind_at);
  if (at === null) return false;
  if (u.last_reminded_on === localDate(now, u.timezone)) return false;
  const nowMin = localMinutes(now, u.timezone);
  return nowMin >= at && nowMin < at + LATE_WINDOW_MIN;
}

export function reminderText(due: number, newLeft: number) {
  if (due > 0 && newLeft > 0) return `На сьогодні ${due} на повтор і ${newLeft} нових слів. Кілька хвилин — і готово.`;
  if (due > 0) return `На сьогодні ${due} карток на повтор — саме час, поки не забулись.`;
  return `Сьогодні чекають ${newLeft} нових слів. Кілька хвилин — і готово.`;
}
