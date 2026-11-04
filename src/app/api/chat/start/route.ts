import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { startChat } from "@/lib/chat/chat-server";

// {scenario} → нова розмова з першим повідомленням AI (статичним, без API)
export async function POST(req: Request) {
  const user = await getUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { scenario?: unknown };
  try {
    const r = await startChat(user.id, body.scenario);
    return r ? NextResponse.json(r) : NextResponse.json({ error: "bad_request" }, { status: 400 });
  } catch (e) {
    console.error("chat start failed", e);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
}
