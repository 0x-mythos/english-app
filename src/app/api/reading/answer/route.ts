import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { loadTexts } from "@/lib/reading/texts-server";
import { findText, gradeAnswers, parseAnswerBody } from "@/lib/reading/views";

// Відповіді на питання: правильні індекси й пояснення віддаємо лише після відправки. Нічого не пишемо в БД.
export async function POST(req: Request) {
  const user = await getUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = parseAnswerBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 422 });
  const t = findText(loadTexts(), body.id);
  if (!t) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const graded = gradeAnswers(t, body.answers);
  if (!graded) return NextResponse.json({ error: "bad_request" }, { status: 422 });
  return NextResponse.json(graded);
}
