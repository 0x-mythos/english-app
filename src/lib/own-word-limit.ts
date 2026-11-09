// Денний ліміт викликів Claude для «свого слова». Лічильник у пам'яті процесу (без міграції): рестарт скидає — для одного процесу це ок.

export const OWN_WORD_DAILY_LIMIT = 30;

export const OWN_WORD_LIMIT_MESSAGE = "Сьогодні вже 30 нових слів через AI — це денний ліміт. Завтра можна ще, а слова з наборів додаються без обмежень.";

/** `take` рахує виклик і повертає false, коли ліміт за цю дату вичерпано. Один запис на користувача (стара дата перезаписується). */
export function createDailyLimiter(limit = OWN_WORD_DAILY_LIMIT) {
  const byUser = new Map<string, { date: string; n: number }>();
  return {
    take(userId: string, date: string): boolean {
      const cur = byUser.get(userId);
      const n = cur && cur.date === date ? cur.n : 0;
      if (n >= limit) return false;
      byUser.set(userId, { date, n: n + 1 });
      return true;
    },
  };
}
