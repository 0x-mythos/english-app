import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { loadTexts } from "@/lib/reading/texts-server";
import { findText, textView } from "@/lib/reading/views";

// Один текст: питання без правильних відповідей. id шукається лише в Map завантажених файлів.
export async function GET(req: Request) {
  const user = await getUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const t = findText(loadTexts(), new URL(req.url).searchParams.get("id"));
  if (!t) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(textView(t));
}
