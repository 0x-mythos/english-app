import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { answerDrill } from "@/lib/grammar/drills-server";
import { recordActivity } from "@/lib/streak-server";

// Відповідь на дрил: перевірка лише тут, спроба пишеться в grammar_attempts, день зараховується в стрік.
export async function POST(req: Request) {
  const user = await getUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: unknown; answer?: unknown; accept?: unknown };
  if (typeof body.id !== "string" || !/^[a-z_]+-\d+$|^m\d+$/.test(body.id) || typeof body.answer !== "string" || !body.answer.trim()) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const now = new Date();
  try {
    const r = await answerDrill(user.id, body.id, body.answer, body.accept === true);
    if (r.status === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    try {
      const { data: u } = await db.from("users").select("timezone").eq("id", user.id).single();
      await recordActivity(user.id, u?.timezone ?? "Europe/Warsaw", now);
    } catch (e) {
      console.error("streak update failed", e);
    }
    return NextResponse.json({ correct: r.correct, expected: r.expected, explanation: r.explanation });
  } catch (e) {
    console.error("drill answer failed", e);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
}
