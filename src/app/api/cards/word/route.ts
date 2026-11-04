import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { addKnownWord } from "@/lib/own-word-server";

// Слово з готовими даними (з розмови з AI): {word, translation, transcription?, example?} → картка без виклику Claude
export async function POST(req: Request) {
  const user = await getUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const r = await addKnownWord(user.id, body);
    return "card" in r ? NextResponse.json(r) : NextResponse.json({ status: r.status }, { status: 422 });
  } catch (e) {
    console.error("known word failed", e);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
}
