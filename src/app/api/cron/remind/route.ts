import { NextResponse } from "next/server";
import { isBearerValid } from "@/lib/bearer";
import { runReminders } from "@/lib/srs/remind-runner";

// Для зовнішнього крона (Vercel Cron тощо). На Маку те саме запускає instrumentation.ts кожні 5 хв.
export async function GET(req: Request) {
  if (!isBearerValid(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sent = await runReminders();
  return NextResponse.json({ sent });
}
