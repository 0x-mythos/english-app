// На Маку немає Vercel Cron, а ставити ще один LaunchDaemon — це sudo. Тож нагадування крутяться всередині `next start`.
const EVERY_MS = 5 * 60_000;

export async function register() {
  // саме така перевірка: webpack вирізає гілку з edge-збірки лише за прямим порівнянням NEXT_RUNTIME
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NODE_ENV !== "production" || process.env.VERCEL) return;
    const { runReminders } = await import("@/lib/srs/remind-runner");
    const tick = () => runReminders().catch((e) => console.error("reminders tick failed", e));
    setTimeout(tick, 30_000);
    setInterval(tick, EVERY_MS);
  }
}
