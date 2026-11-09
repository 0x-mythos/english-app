import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { selectTexts } from "@/lib/reading/select";
import { loadTexts } from "@/lib/reading/texts-server";
import { listItems } from "@/lib/reading/views";

// Список текстів для юзера: рівень із вступного тесту, тексти за цілями першими. Без тексту, питань і відповідей.
export async function GET(req: Request) {
  const user = await getUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [u, p] = await Promise.all([
    db.from("users").select("goals").eq("id", user.id).single(),
    db.from("skill_profile").select("reading_level").eq("user_id", user.id).maybeSingle(),
  ]);
  if (u.error || p.error) return NextResponse.json({ error: "db" }, { status: 500 });

  const texts = selectTexts([...loadTexts().values()], p.data?.reading_level ?? null, (u.data.goals ?? []) as string[]);
  return NextResponse.json({ texts: listItems(texts) });
}
