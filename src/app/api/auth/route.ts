import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { resolveTgUser } from "@/lib/auth";

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
    .select("id, first_name, minutes_per_day")
    .single();
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });

  const [{ count: due }, { data: profile }] = await Promise.all([
    db.from("cards").select("id", { count: "exact", head: true }).eq("user_id", user.id).lte("due", new Date().toISOString()),
    db
      .from("skill_profile")
      .select("vocab_size_est, grammar_level, reading_level, writing_level, weak_topics, tested_at")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({ user, due: due ?? 0, profile: profile ?? null });
}
