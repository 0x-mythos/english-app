import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { runAddReadingCard } from "@/lib/reading/add-card";
import { findInDict } from "@/lib/reading/dictionary";
import { prepareCard } from "@/lib/reading/card";
import { cardStore, fetchWordRows, loadDictionary, loadTexts } from "@/lib/reading/texts-server";
import { findText, parseCardBody } from "@/lib/reading/views";
import { normalizeOwnWord } from "@/lib/own-word";

// «+» у читанні: {textId, word, sentence}. Переклад — з глосарію тексту/words на сервері, речення мусить бути з цього тексту.
export async function POST(req: Request) {
  const user = await getUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = parseCardBody(raw);
  if (!parsed) return NextResponse.json({ error: "bad_request" }, { status: 422 });
  const text = findText(loadTexts(), parsed.textId);
  if (!text) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const w = normalizeOwnWord(parsed.word);
    const rows = w ? await fetchWordRows(w) : [];
    const dict = loadDictionary();
    const lemma = w ? findInDict(dict, w)?.lemma : undefined;
    const lemmaRows = lemma && lemma.toLowerCase() !== w ? await fetchWordRows(lemma) : [];
    const p = prepareCard(text, raw, rows, dict, lemmaRows);
    if (!("plan" in p)) {
      return p.status === "not_found"
        ? NextResponse.json({ error: "not_found" }, { status: 404 })
        : NextResponse.json({ error: "bad_request" }, { status: 422 });
    }
    return NextResponse.json(await runAddReadingCard(cardStore(user.id), p.plan));
  } catch (e) {
    console.error("reading card failed", e);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
}
