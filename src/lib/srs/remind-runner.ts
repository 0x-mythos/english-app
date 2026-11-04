import "server-only";
import { existsSync, readFileSync } from "fs";
import { Api, InlineKeyboard } from "grammy";
import { db } from "@/lib/supabase";
import { dueCount, newSlotsLeft, studiedToday, type DeckUser } from "@/lib/srs/deck";
import { reminderText, shouldRemind } from "@/lib/srs/reminders";
import { localDate } from "@/lib/srs/session";

/** Публічна адреса: PUBLIC_URL або файл, який пише quick tunnel на Маку (адреса міняється при рестарті). */
export function publicUrl(): string | null {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  const file = `${process.cwd()}/logs/public_url`;
  return existsSync(file) ? readFileSync(file, "utf8").trim() || null : null;
}

/** Один прохід: кому час — шле нагадування з кнопкою Mini App. Повертає, скільком надіслано. */
export async function runReminders(now = new Date()) {
  const { data: users, error } = await db
    .from("users")
    .select("id, telegram_id, goals, minutes_per_day, timezone, remind_at, reminders_on, last_reminded_on, skill_profile(tested_at)")
    .eq("reminders_on", true);
  if (error) throw error;

  const api = new Api(process.env.TELEGRAM_BOT_TOKEN!);
  const url = publicUrl();
  let sent = 0;

  for (const u of users) {
    // без тесту карток нема — нагадувати нема про що
    const profile = Array.isArray(u.skill_profile) ? u.skill_profile[0] : u.skill_profile;
    if (!profile?.tested_at) continue;
    const deckUser = u as unknown as DeckUser;
    try {
      if (!shouldRemind(u, now, await studiedToday(deckUser, now))) continue;
      const [due, newLeft] = await Promise.all([dueCount(u.id, now), newSlotsLeft(deckUser, now)]);
      // день позначаємо навіть коли слати нічого — щоб не перевіряти юзера кожні 5 хв до ночі
      await db.from("users").update({ last_reminded_on: localDate(now, u.timezone) }).eq("id", u.id);
      if (due + newLeft === 0) continue;
      await api.sendMessage(u.telegram_id, reminderText(due, newLeft), {
        reply_markup: url ? new InlineKeyboard().webApp("Повторити", `${url}/learn`) : undefined,
      });
      sent++;
    } catch (e) {
      console.error("reminder failed", u.id, e);
    }
  }
  return sent;
}
