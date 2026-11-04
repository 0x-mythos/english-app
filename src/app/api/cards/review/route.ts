import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { isGrade, previewIntervals, review, type CardRow } from "@/lib/srs/fsrs";
import { recordActivity } from "@/lib/streak-server";

const FSRS_FIELDS = "id, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review";

// Повтор: FSRS рахується лише тут; кожен повтор іде в review_logs.
export async function POST(req: Request) {
  const user = await getUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { cardId?: unknown; rating?: unknown; durationMs?: unknown };
  const cardId = Number(body.cardId);
  if (!Number.isSafeInteger(cardId) || !isGrade(body.rating)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const durationMs =
    typeof body.durationMs === "number" && body.durationMs >= 0 ? Math.min(Math.round(body.durationMs), 600_000) : null;

  const { data: row, error } = await db.from("cards").select(FSRS_FIELDS).eq("id", cardId).eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Date();
  const { patch, log } = review(row as CardRow, body.rating, now);

  // reps як версія: подвійний тап / повтор запиту не зарахує той самий повтор двічі
  const upd = await db.from("cards").update(patch).eq("id", cardId).eq("user_id", user.id).eq("reps", row.reps).select("id");
  if (upd.error) return NextResponse.json({ error: "db" }, { status: 500 });
  if (upd.data.length === 0) return NextResponse.json({ error: "conflict" }, { status: 409 });

  const ins = await db.from("review_logs").insert({ ...log, card_id: cardId, user_id: user.id, duration_ms: durationMs });
  if (ins.error) console.error("review log insert failed", ins.error);

  // стрік: день зараховано першим же повтором (помилка тут не має ламати сам повтор)
  try {
    const { data: u } = await db.from("users").select("timezone").eq("id", user.id).single();
    await recordActivity(user.id, u?.timezone ?? "Europe/Warsaw", now);
  } catch (e) {
    console.error("streak update failed", e);
  }

  return NextResponse.json({ due: patch.due, state: patch.state, intervals: previewIntervals(patch, now) });
}
