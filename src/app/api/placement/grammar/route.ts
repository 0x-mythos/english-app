import { NextResponse } from "next/server";
import { resolveTgUser } from "@/lib/auth";
import { GRAMMAR_QUESTIONS_TOTAL, nextQuestion, scoreGrammar, toPublic, validateHistory } from "@/lib/placement/grammar";
import { publicReading, readingTextFor } from "@/lib/placement/reading";

// Stateless: клієнт шле всю історію, сервер повертає наступне питання (без правильної відповіді) або done + текст для читання.
export async function POST(req: Request) {
  if (!resolveTgUser(req.headers.get("x-tg-init-data") ?? "")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { history } = (await req.json().catch(() => ({}))) as { history?: unknown };
  if (!validateHistory(history)) return NextResponse.json({ error: "bad_history" }, { status: 400 });

  const next = nextQuestion(history);
  if (next) {
    return NextResponse.json({ done: false, question: toPublic(next), index: history.length, total: GRAMMAR_QUESTIONS_TOTAL });
  }
  const { level } = scoreGrammar(history);
  return NextResponse.json({ done: true, reading: publicReading(readingTextFor(level)) });
}
