import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { isAllowedUser } from "@/lib/access";
import { db } from "@/lib/supabase";
import { parseTime } from "@/lib/srs/reminders";
import { publicUrl } from "@/lib/srs/remind-runner";
import { normalizeOwnWord } from "@/lib/own-word";
import { addOwnWord } from "@/lib/own-word-server";
import { OWN_WORD_LIMIT_MESSAGE } from "@/lib/own-word-limit";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

// Перший обробник: чужі апдейти не доходять ні до бази, ні до Claude
bot.use(async (ctx, next) => {
  if (ctx.from && isAllowedUser(ctx.from.id)) return next();
  if (ctx.from && ctx.chat?.type === "private") await ctx.reply(`Це приватний бот. Твій Telegram ID: ${ctx.from.id}`);
});

bot.command("start", async (ctx) => {
  // Адреса лише з конфігурації сервера: заголовки запиту може підробити будь-хто
  const appUrl = publicUrl();
  const keyboard = appUrl ? new InlineKeyboard().webApp("Відкрити", appUrl) : undefined;
  await ctx.reply(
    "Привіт! Тут ти вчиш англійську під себе: короткий тест рівня, картки з інтервальним повторенням і розмова з AI. Тисни «Відкрити» або кнопку меню зліва від поля вводу.\n\nПобачив незнайоме слово — просто надішли його сюди, і я зроблю з нього картку.",
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

// «Своє слово»: будь-який текст без «/» → картка. Другий рядок (необов'язково) — речення, де слово трапилось.
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return ctx.reply("Не знаю такої команди. Є /start і /remind. А слово просто надішли текстом.");
  const [word, ...rest] = text.split("\n");
  if (!normalizeOwnWord(word)) {
    return ctx.reply("Надішли англійське слово або фразу (до 5 слів). Можна з другого рядка додати речення, де ти його побачив.");
  }

  const { data: user } = await db
    .from("users")
    .upsert({ telegram_id: ctx.from.id, first_name: ctx.from.first_name ?? null, username: ctx.from.username ?? null }, { onConflict: "telegram_id" })
    .select("id")
    .single();
  if (!user) return ctx.reply("Не вийшло, спробуй ще раз трохи згодом.");

  await ctx.replyWithChatAction("typing");
  const r = await addOwnWord(user.id, word, rest.join(" ")).catch((e) => {
    console.error("bot own word failed", e);
    return { status: "ai_error" as const };
  });
  if (r.status === "limit") return ctx.reply(OWN_WORD_LIMIT_MESSAGE);
  if (r.status === "not_a_word") return ctx.reply(`Не знайшов такого англійського слова: «${word.trim()}». Перевір написання?`);
  if (!("card" in r)) return ctx.reply("Не вийшло додати, спробуй ще раз трохи згодом.");

  const c = r.card;
  const lines = [
    `${r.status === "exists" ? "Вже є в картках" : "Додав у картки"}: ${c.word}${c.transcription ? ` [${c.transcription}]` : ""} — ${c.translation}`,
    c.example ? `Приклад: ${c.example}` : "",
    r.status === "added" ? "З'явиться серед нових слів у наступній сесії." : "",
  ];
  return ctx.reply(lines.filter(Boolean).join("\n"));
});

// Без секрету grammY не перевіряє заголовок Telegram, тому такий webhook не обслуговуємо зовсім.
const secret = process.env.CRON_SECRET;
const handle = secret ? webhookCallback(bot, "std/http", { secretToken: secret }) : null;

export async function POST(req: Request) {
  if (!handle) return new Response("webhook secret is not configured", { status: 503 });
  return handle(req);
}
