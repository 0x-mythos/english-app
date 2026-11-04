import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { db } from "@/lib/supabase";
import { parseTime } from "@/lib/srs/reminders";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
let appUrl = "";

bot.command("start", async (ctx) => {
  const keyboard = appUrl ? new InlineKeyboard().webApp("Відкрити", appUrl) : undefined;
  await ctx.reply(
    "Привіт! Тут ти вчиш англійську під себе: короткий тест рівня, картки з інтервальним повторенням і розмова з AI. Тисни «Відкрити» або кнопку меню зліва від поля вводу.",
    { reply_markup: keyboard },
  );
});

// /remind 20:30 — час нагадування, /remind off — вимкнути, /remind — показати поточне
bot.command("remind", async (ctx) => {
  if (!ctx.from) return;
  const arg = ctx.match.trim().toLowerCase();
  const { data: user } = await db
    .from("users")
    .upsert({ telegram_id: ctx.from.id, first_name: ctx.from.first_name ?? null, username: ctx.from.username ?? null }, { onConflict: "telegram_id" })
    .select("id, remind_at, reminders_on")
    .single();
  if (!user) return ctx.reply("Не вийшло, спробуй ще раз трохи згодом.");

  if (!arg) {
    return ctx.reply(
      user.reminders_on
        ? `Нагадую щодня о ${user.remind_at.slice(0, 5)}, якщо ще не займався. Змінити: /remind 20:30, вимкнути: /remind off`
        : "Нагадування вимкнені. Увімкнути: /remind 19:00",
    );
  }
  if (arg === "off") {
    await db.from("users").update({ reminders_on: false }).eq("id", user.id);
    return ctx.reply("Вимкнув нагадування. Повернути: /remind 19:00");
  }
  const min = parseTime(arg);
  if (min === null) return ctx.reply("Напиши час так: /remind 20:30");
  const time = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  // last_reminded_on скидаємо, щоб новий час спрацював уже сьогодні
  await db.from("users").update({ remind_at: time, reminders_on: true, last_reminded_on: null }).eq("id", user.id);
  return ctx.reply(`Готово, нагадуватиму о ${time} (час Варшави).`);
});

const handle = webhookCallback(bot, "std/http", { secretToken: process.env.CRON_SECRET });

export async function POST(req: Request) {
  // Telegram стукає через тунель → його хост і є публічна адреса застосунку (quick tunnel міняє її при рестарті)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && !host.startsWith("127.0.0.1") && !host.startsWith("localhost")) appUrl = `https://${host}`;
  return handle(req);
}
