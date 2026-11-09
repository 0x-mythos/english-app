/**
 * Хто може користуватись застосунком: ALLOWED_TELEGRAM_IDS, id через кому.
 * Порожній список пускає лише в розробці: забута змінна на проді не має відкривати доступ усім.
 */
export function isTelegramIdAllowed(id: number, allowed: string | undefined, isDev: boolean): boolean {
  const ids = (allowed ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
  if (ids.length === 0) return isDev;
  return ids.includes(id);
}

export const isAllowedUser = (id: number): boolean =>
  isTelegramIdAllowed(id, process.env.ALLOWED_TELEGRAM_IDS, process.env.NODE_ENV === "development");
