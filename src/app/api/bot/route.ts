import { Bot, InlineKeyboard, webhookCallback } from "grammy";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
let appUrl = "";

bot.command("start", async (ctx) => {
  const keyboard = appUrl ? new InlineKeyboard().webApp("Відкрити", appUrl) : undefined;
  await ctx.reply(
    "Привіт! Тут ти вчиш англійську під себе: короткий тест рівня, картки з інтервальним повторенням і розмова з AI. Тисни «Відкрити» або кнопку меню зліва від поля вводу.",
    { reply_markup: keyboard },
  );
});

const handle = webhookCallback(bot, "std/http", { secretToken: process.env.CRON_SECRET });

export async function POST(req: Request) {
  // Telegram стукає через тунель → його хост і є публічна адреса застосунку (quick tunnel міняє її при рестарті)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && !host.startsWith("127.0.0.1") && !host.startsWith("localhost")) appUrl = `https://${host}`;
  return handle(req);
}
