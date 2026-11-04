// Заливає data/words/*.json у таблицю words (upsert за word+set_name — можна запускати повторно). Запуск з app/:
//   node --env-file=.env.local scripts/seed-words.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

for (const set of ["everyday", "it"]) {
  const { batches } = JSON.parse(readFileSync(new URL(`../data/words/${set}.json`, import.meta.url), "utf8"));
  const rows = Object.values(batches).flat().map((w) => ({
    word: w.word,
    translation: w.translation,
    transcription: w.transcription,
    example: w.example,
    set_name: set,
    topic: w.topic ?? null,
    freq_rank: w.freq_rank,
    cefr: w.cefr,
  }));
  const { error } = await db.from("words").upsert(rows, { onConflict: "word,set_name" });
  if (error) throw error;
  console.log(`${set}: ${rows.length}`);
}
