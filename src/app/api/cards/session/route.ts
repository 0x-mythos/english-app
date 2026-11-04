import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { topUpNewCards, type DeckUser } from "@/lib/srs/deck";
import { CARD_FIELDS, toSessionCard, type SessionRow } from "@/lib/srs/session-card";
import { dailyLimits } from "@/lib/srs/session";

// Сесія: спершу повтори, що настали, потім нові на сьогодні (додаються тут же, в межах денного ліміту).
export async function GET(req: Request) {
  const auth = await getUser(req).catch(() => null);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: user, error } = await db.from("users").select("id, goals, minutes_per_day, timezone").eq("id", auth.id).single();
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });

  const now = new Date();
  const { newPerDay, reviewsPerSession } = dailyLimits(user.minutes_per_day);
  try {
    await topUpNewCards(user as DeckUser, now);
  } catch (e) {
    console.error("top up failed", e);
  }

  const [reviews, fresh] = await Promise.all([
    db.from("cards").select(CARD_FIELDS).eq("user_id", user.id).neq("state", 0)
      .lte("due", now.toISOString()).order("due").limit(reviewsPerSession),
    db.from("cards").select(CARD_FIELDS).eq("user_id", user.id).eq("state", 0).order("id").limit(newPerDay),
  ]);
  if (reviews.error || fresh.error) return NextResponse.json({ error: "db" }, { status: 500 });

  const rows = [...(reviews.data as unknown as SessionRow[]), ...(fresh.data as unknown as SessionRow[])];
  return NextResponse.json({ cards: rows.map((r) => toSessionCard(r, now)), reviews: reviews.data.length, fresh: fresh.data.length });
}
