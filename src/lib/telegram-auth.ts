import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type VerifyResult =
  | { ok: true; user: TelegramUser; authDate: Date }
  | { ok: false; reason: "missing_hash" | "bad_hash" | "expired" | "no_user" };

/**
 * Перевіряє Telegram Mini App initData.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * secret = HMAC_SHA256(key="WebAppData", botToken); hash = HMAC_SHA256(secret, data_check_string)
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  { maxAgeSec = 24 * 60 * 60, now = Date.now() }: { maxAgeSec?: number; now?: number } = {},
): VerifyResult {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "missing_hash" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "bad_hash" };
  }

  const authDate = new Date(Number(params.get("auth_date")) * 1000);
  if (!Number.isFinite(authDate.getTime()) || now - authDate.getTime() > maxAgeSec * 1000) {
    return { ok: false, reason: "expired" };
  }

  const rawUser = params.get("user");
  if (!rawUser) return { ok: false, reason: "no_user" };
  return { ok: true, user: JSON.parse(rawUser) as TelegramUser, authDate };
}
