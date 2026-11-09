import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { addOwnWord } from "@/lib/own-word-server";

// «Своє слово» з додатку: {word, context?} → Claude дописує → нова картка (або вже була).
export async function POST(req: Request) {
  const user = await getUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { word?: unknown; context?: unknown };
  try {
    const r = await addOwnWord(user.id, body.word, body.context);
    if (r.status === "added" || r.status === "exists") return NextResponse.json(r);
    return NextResponse.json({ status: r.status }, { status: r.status === "ai_error" ? 502 : r.status === "limit" ? 429 : 422 });
  } catch (e) {
    console.error("own word failed", e);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
}
