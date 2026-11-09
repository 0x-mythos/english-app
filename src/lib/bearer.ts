import { createHash, timingSafeEqual } from "crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Порожній або незаданий секрет завжди відмовляє: інакше підійшов би заголовок `Bearer undefined`. */
export function isBearerValid(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
