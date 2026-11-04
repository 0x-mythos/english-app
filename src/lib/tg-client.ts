// Клієнтські хелпери Telegram Mini App: initData іде в заголовку `x-tg-init-data` до наших API.

type TelegramWebApp = {
  initData: string;
  ready(): void;
  expand(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
};
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function tgInit() {
  const tg = window.Telegram?.WebApp;
  tg?.ready();
  tg?.expand();
  // шапка і фон Telegram — під наш фон, а не сірі системні
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
  if (bg) {
    try {
      tg?.setHeaderColor?.(bg);
      tg?.setBackgroundColor?.(bg);
      tg?.setBottomBarColor?.(bg);
    } catch {
      // старі клієнти Telegram не знають цих методів
    }
  }
  return tg?.initData ?? "";
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-tg-init-data": window.Telegram?.WebApp?.initData ?? "" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.status === 401 ? "unauthorized" : `http_${r.status}`);
  return r.json() as Promise<T>;
}
