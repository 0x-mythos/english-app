import "server-only";
import { isAllowedUser } from "@/lib/access";
import { db } from "@/lib/supabase";
import { verifyInitData, type TelegramUser } from "@/lib/telegram-auth";

// Dev-вхід поза Telegram: лише `next dev` і лише коли initData порожній.
const DEV_USER: TelegramUser = { id: 1, first_name: "Dev" };

export function resolveTgUser(initData: string): TelegramUser | null {
  if (!initData && process.env.NODE_ENV === "development") return DEV_USER;
  const r = verifyInitData(initData, process.env.TELEGRAM_BOT_TOKEN!);
  return r.ok && isAllowedUser(r.user.id) ? r.user : null;
}

/** Користувач з заголовка `x-tg-init-data` → рядок `users` (створює, якщо нема). null = не автентифікований. */
export async function getUser(req: Request): Promise<{ id: string } | null> {
  const tgUser = resolveTgUser(req.headers.get("x-tg-init-data") ?? "");
  if (!tgUser) return null;
  const { data, error } = await db
    .from("users")
    .upsert(
      { telegram_id: tgUser.id, first_name: tgUser.first_name ?? null, username: tgUser.username ?? null },
      { onConflict: "telegram_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data;
}
