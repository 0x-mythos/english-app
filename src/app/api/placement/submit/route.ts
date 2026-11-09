import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { GRAMMAR_QUESTIONS_TOTAL, scoreGrammar, validateHistory } from "@/lib/placement/grammar";
import { readingTextFor, scoreReading } from "@/lib/placement/reading";
import { scoreVocab } from "@/lib/placement/vocab";
import {
  canAssessWriting, parseWritingResult, WRITING_MAX_CHARS, WRITING_MIN_CHARS, WRITING_SYSTEM, writingUserMessage, type WritingResult,
} from "@/lib/placement/writing";

const GOALS = ["it", "everyday"];
const MINUTES = [5, 10, 15, 20, 30];

type Body = {
  goals?: unknown;
  minutesPerDay?: unknown;
  vocab?: unknown;
  grammar?: unknown;
  reading?: unknown;
  writing?: unknown;
};

const anthropic = new Anthropic();

async function assessWriting(text: string): Promise<WritingResult | null> {
  try {
    const msg = await anthropic.messages.create(
      {
        model: "claude-sonnet-5-5",
        max_tokens: 1024,
        system: WRITING_SYSTEM,
        messages: [{ role: "user", content: writingUserMessage(text) }],
      },
      { timeout: 30_000 },
    );
    const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return parseWritingResult(raw);
  } catch (e) {
    console.error("writing assessment failed", e);
    return null;
  }
}

// Усі оцінки рахуються тут заново з сирих відповідей — клієнту не довіряємо.
export async function POST(req: Request) {
  const user = await getUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const goals = Array.isArray(body.goals) ? body.goals.filter((g): g is string => GOALS.includes(g as string)) : [];
  const minutes = MINUTES.includes(body.minutesPerDay as number) ? (body.minutesPerDay as number) : 10;
  const known = body.vocab && typeof body.vocab === "object" ? (body.vocab as Record<string, boolean>) : {};
  const writingText = typeof body.writing === "string" ? body.writing.trim() : "";
  const readingAnswers = Array.isArray(body.reading) ? body.reading.map(Number) : [];

  if (!validateHistory(body.grammar) || body.grammar.length !== GRAMMAR_QUESTIONS_TOTAL) {
    return NextResponse.json({ error: "bad_grammar" }, { status: 400 });
  }
  if (goals.length === 0) return NextResponse.json({ error: "bad_goals" }, { status: 400 });
  if (writingText.length < WRITING_MIN_CHARS || writingText.length > WRITING_MAX_CHARS) {
    return NextResponse.json({ error: "bad_writing" }, { status: 400 });
  }

  const vocab = scoreVocab(Object.fromEntries(Object.entries(known).map(([k, v]) => [k, v === true])));
  const grammar = scoreGrammar(body.grammar);
  const readingText = readingTextFor(grammar.level);
  const reading = scoreReading(readingText.level, readingAnswers);
  // Письмо оцінює Claude не частіше разу на добу; повторний тест за добу лишає попередню оцінку
  const { data: previous } = await db.from("skill_profile").select("tested_at, writing_level").eq("user_id", user.id).maybeSingle();
  // Обмежуємо лише після успішної оцінки: збій Claude не блокує повторну спробу
  const writing = canAssessWriting(previous?.writing_level ? previous.tested_at : null, new Date()) ? await assessWriting(writingText) : null;

  const now = new Date().toISOString();
  const profile = {
    user_id: user.id,
    vocab_size_est: vocab.size,
    grammar_level: grammar.level,
    reading_level: reading.level,
    writing_level: writing?.cefr ?? previous?.writing_level ?? null,
    weak_topics: grammar.weakTopics,
    tested_at: now,
    updated_at: now,
  };

  const [p, u] = await Promise.all([
    db.from("skill_profile").upsert(profile, { onConflict: "user_id" }),
    db.from("users").update({ goals, minutes_per_day: minutes }).eq("id", user.id),
  ]);
  if (p.error || u.error) return NextResponse.json({ error: "db" }, { status: 500 });

  // Перепроходження тесту замінює помилки з попереднього тесту, а не дублює їх
  if (writing) {
    const del = await db.from("mistakes").delete().eq("user_id", user.id).eq("source", "test");
    const ins = writing.errors.length
      ? await db.from("mistakes").insert(
          writing.errors.map((e) => ({
            user_id: user.id,
            kind: e.topic === "vocabulary" ? "vocab" : "grammar",
            topic: e.topic,
            original: e.original,
            corrected: e.corrected,
            explanation: e.explanation,
            source: "test",
          })),
        )
      : { error: null };
    if (del.error || ins.error) return NextResponse.json({ error: "db" }, { status: 500 });
  }

  return NextResponse.json({
    vocab: { size: vocab.size, cefr: vocab.cefr },
    grammar: { level: grammar.level, correct: grammar.correct, total: grammar.total, weakTopics: grammar.weakTopics },
    reading: { level: reading.level, correct: reading.correct, total: readingText.questions.length },
    writing: writing ? { level: writing.cefr, errors: writing.errors } : null,
  });
}
