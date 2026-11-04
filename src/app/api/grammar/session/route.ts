import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { drillSession } from "@/lib/grammar/drills-server";

// Граматичні дрили на сьогодні: теми з власних помилок і слабких тем тесту. Без правильних відповідей.
export async function GET(req: Request) {
  const auth = await getUser(req).catch(() => null);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: user, error } = await db.from("users").select("id, minutes_per_day, timezone").eq("id", auth.id).single();
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });

  try {
    return NextResponse.json(await drillSession({ ...user, timezone: user.timezone ?? "Europe/Warsaw" }, new Date()));
  } catch (e) {
    console.error("drill session failed", e);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
}
