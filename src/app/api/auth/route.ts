import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { resolveTgUser } from "@/lib/auth";
import { streakView } from "@/lib/streak-server";

export async function POST(req: Request) {
  const { initData } = (await req.json().catch(() => ({}))) as { initData?: string };

  const tgUser = resolveTgUser(initData ?? "");
  if (!tgUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: user, error } = await db
    .from("users")
    .upsert(
      { telegram_id: tgUser.id, first_name: tgUser.first_name ?? null, username: tgUser.username ?? null },
      { onConflict: "telegram_id" },
    )
    .select("id, first_name, minutes_per_day, timezone")
    .single();
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });

  const now = new Date();
  const [{ count: due }, { data: profile }, { count: learned }, { count: learning }, streak] = await Promise.all([
    db.from("cards").select("id", { count: "exact", head: true }).eq("user_id", user.id).lte("due", new Date().toISOString()),
    db
      .from("skill_profile")
      .select("vocab_size_est, grammar_level, reading_level, writing_level, weak_topics, tested_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    // «вивчено» = картка вийшла з навчання в звичайні повтори (FSRS state 2 = Review)
    db.from("cards").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("state", 2),
    db.from("cards").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("state", [1, 3]),
    streakView(user.id, user.timezone, now).catch(() => null),
  ]);

  return NextResponse.json({
    user: { id: user.id, first_name: user.first_name },
    due: due ?? 0,
    profile: profile ?? null,
    progress: { learned: learned ?? 0, learning: learning ?? 0 },
    streak,
  });
}
