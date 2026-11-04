import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sendMessage } from "@/lib/chat/chat-server";

const STATUS = { bad_request: 400, not_found: 404, limit: 429, ai_error: 502 } as const;

// {sessionId, text} → {reply, corrections, words}
export async function POST(req: Request) {
  const user = await getUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { sessionId?: unknown; text?: unknown };
  try {
    const r = await sendMessage(user.id, body.sessionId, body.text);
    if (r.status === "ok") return NextResponse.json(r.reply);
    return NextResponse.json({ error: r.status }, { status: STATUS[r.status] });
  } catch (e) {
    console.error("chat message failed", e);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
}
