import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/supabase";
import { startOfLocalDay } from "@/lib/srs/session";
import {
  CHAT_DAILY_LIMIT,
  CHAT_MAX_CHARS,
  CHAT_SCHEMA,
  chatSystem,
  historyForModel,
  mistakeKind,
  parseChatReply,
  scenarioById,
  type ChatReply,
  type LearnerProfile,
} from "@/lib/chat/chat";

const anthropic = new Anthropic();

/** Нова розмова: сесія + статичне перше повідомлення AI (без виклику API). */
export async function startChat(userId: string, scenarioId: unknown) {
  const s = scenarioById(scenarioId);
  if (!s) return null;
  const { data: session, error } = await db.from("chat_sessions").insert({ user_id: userId, scenario: s.id }).select("id").single();
  if (error) throw error;
  const ins = await db.from("chat_messages").insert({ session_id: session.id, role: "assistant", content: s.opener });
  if (ins.error) throw ins.error;
  return { sessionId: session.id as string, scenario: s.id, opener: s.opener };
}

async function userMessagesToday(userId: string, timeZone: string, now: Date) {
  const { data: sessions, error } = await db.from("chat_sessions").select("id").eq("user_id", userId)
    .gte("created_at", new Date(now.getTime() - 2 * 86_400_000).toISOString());
  if (error) throw error;
  if (sessions.length === 0) return 0;
  const { count, error: e2 } = await db.from("chat_messages").select("id", { count: "exact", head: true })
    .in("session_id", sessions.map((s) => s.id)).eq("role", "user")
    .gte("created_at", startOfLocalDay(now, timeZone).toISOString());
  if (e2) throw e2;
  return count ?? 0;
}

export type SendResult =
  | { status: "ok"; reply: ChatReply }
  | { status: "bad_request" | "not_found" | "limit" | "ai_error" };

/** Повідомлення юзера → Claude (роль сценарію + рівень) → відповідь, 1–2 виправлення в журнал помилок, корисні слова. */
export async function sendMessage(userId: string, sessionId: unknown, rawText: unknown, now = new Date()): Promise<SendResult> {
  const text = typeof rawText === "string" ? rawText.trim().replace(/\s+/g, " ") : "";
  if (!text || text.length > CHAT_MAX_CHARS || typeof sessionId !== "string") return { status: "bad_request" };

  const { data: session } = await db.from("chat_sessions").select("id, scenario").eq("id", sessionId).eq("user_id", userId).maybeSingle();
  const scenario = scenarioById(session?.scenario);
  if (!session || !scenario) return { status: "not_found" };

  const [{ data: user }, { data: profile }, { data: rows, error }] = await Promise.all([
    db.from("users").select("timezone").eq("id", userId).single(),
    db.from("skill_profile").select("grammar_level, weak_topics").eq("user_id", userId).maybeSingle(),
    db.from("chat_messages").select("role, content").eq("session_id", session.id).order("id"),
  ]);
  if (error) throw error;
  if ((await userMessagesToday(userId, user?.timezone ?? "Europe/Warsaw", now)) >= CHAT_DAILY_LIMIT) return { status: "limit" };

  const history = historyForModel([...(rows ?? []), { role: "user", content: text }]);
  // перше повідомлення AI (opener) у history не потрапляє, бо історія мусить починатись з user → даємо його в system
  const opener = rows?.[0]?.role === "assistant" ? `\n\nYou opened the conversation with: "${rows[0].content}"` : "";

  let reply: ChatReply | null = null;
  try {
    const msg = await anthropic.messages.create(
      {
        model: "claude-sonnet-5-5",
        max_tokens: 1500,
        system: chatSystem(scenario, profile as LearnerProfile | null) + opener,
        output_config: { effort: "low", format: { type: "json_schema", schema: CHAT_SCHEMA } },
        messages: history,
      } as Anthropic.MessageCreateParamsNonStreaming,
      { timeout: 45_000 },
    );
    reply = parseChatReply(msg.content.map((b) => (b.type === "text" ? b.text : "")).join(""), text);
  } catch (e) {
    console.error("chat: claude failed", e);
  }
  if (!reply) return { status: "ai_error" };

  const ins = await db.from("chat_messages").insert([
    { session_id: session.id, role: "user", content: text, corrections: reply.corrections },
    { session_id: session.id, role: "assistant", content: reply.reply },
  ]);
  if (ins.error) throw ins.error;

  if (reply.corrections.length > 0) {
    const m = await db.from("mistakes").insert(
      reply.corrections.map((c) => ({
        user_id: userId,
        kind: mistakeKind(c.topic),
        topic: c.topic,
        original: c.original,
        corrected: c.corrected,
        explanation: c.explanation,
        source: "chat",
      })),
    );
    if (m.error) console.error("chat: mistakes insert failed", m.error);
  }
  return { status: "ok", reply };
}
