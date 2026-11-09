import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { findInDict } from "@/lib/reading/dictionary";
import { findGlossary, findTranslation } from "@/lib/reading/lookup";
import { fetchWordRows, findUserCard, loadDictionary, loadTexts } from "@/lib/reading/texts-server";
import { findText, parseLookupWord } from "@/lib/reading/views";

// Переклад слова без Claude: вже в картках → глосарій тексту (необов'язковий `id`) → words → словник → unknown.
export async function GET(req: Request) {
  const user = await getUser(req).catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const word = parseLookupWord(params.get("w"));
  if (!word) return NextResponse.json({ error: "bad_word" }, { status: 422 });
  const glossary = findText(loadTexts(), params.get("id"))?.glossary ?? [];

  try {
    const dict = loadDictionary();
    const lemma = findGlossary(glossary, word)?.lemma ?? findInDict(dict, word)?.lemma;
    const have = (await findUserCard(user.id, word)) ?? (lemma ? await findUserCard(user.id, lemma) : null);
    if (have) {
      return NextResponse.json({ status: "in_cards", word, translation: have.translation, transcription: have.transcription });
    }
    const found = findTranslation(glossary, await fetchWordRows(word), word, dict);
    if (!found) return NextResponse.json({ status: "unknown", word });
    return NextResponse.json({
      status: "found", source: found.source, word, lemma: found.lemma, translation: found.translation, transcription: found.transcription,
    });
  } catch (e) {
    console.error("reading lookup failed", e);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
}
