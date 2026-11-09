// Генерує набори слів через Claude → data/words/{everyday,it}.json. Запуск:
//   node --env-file=.env.local scripts/gen-words.mjs [everyday|it]
// Батчі, які вже є у файлі, пропускає — можна перезапускати після збою.
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { VOCAB_ITEMS } from "../src/lib/placement/vocab.ts";

const MODEL = "claude-sonnet-5-5";
const OUT = new URL("../data/words/", import.meta.url);
const PER_BATCH = 40;
const MIN_PER_BATCH = 34;

// слова вступного тесту не вчимо — інакше перепроходження тесту бреше
const EXCLUDE = new Set(VOCAB_ITEMS.map((i) => i.word));

// everyday: частотні діапазони лем (як у тесті словника), ранг = місце в загальному частотному списку
const EVERYDAY_BANDS = [[500, 1000], ...Array.from({ length: 9 }, (_, i) => [(i + 1) * 1000, (i + 2) * 1000])];

const IT_TOPICS = {
  general: "everyday developer vocabulary: working with code, tools, docs, resources, estimates, tasks",
  api: "APIs and backend: requests, endpoints, payloads, auth, errors, rate limits, versioning",
  code_review: "code review and pull requests: feedback, suggestions, readability, refactoring, nitpicks",
  meetings: "stand-ups, planning, retros, syncing with a team, blockers, priorities, deadlines",
  interview: "job interviews for a backend developer: experience, strengths, trade-offs, salary, soft skills",
  devops: "git, CI/CD, deployment, monitoring, incidents, logs, infrastructure",
  data: "databases and data: queries, indexes, migrations, consistency, caching, performance",
};

// structured outputs (forced tool_choice ця модель не підтримує)
const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      words: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            word: { type: "string", description: "lemma or fixed phrase, lowercase unless proper" },
            translation: { type: "string", description: "Ukrainian translation, 1–3 most common meanings, comma-separated" },
            transcription: { type: "string", description: "IPA, British or General American, without slashes" },
            example: { type: "string", description: "natural sentence that contains the word in EXACTLY this form" },
            freq_rank: { type: "integer", description: "approximate rank in a general English lemma frequency list" },
            cefr: { type: "string", enum: ["A1", "A2", "B1", "B2", "C1", "C2"] },
          },
          required: ["word", "translation", "transcription", "example", "freq_rank", "cefr"],
        },
      },
    },
    required: ["words"],
};

const anthropic = new Anthropic();

async function ask(prompt) {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system:
      "You build vocabulary sets for a Ukrainian adult learning English (B1, junior backend developer). " +
      "Translations are natural Ukrainian (not Russian, not calques). Examples are short (8–16 words), modern, and show typical usage. " +
      "Never include offensive words. No duplicates.",
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: prompt }],
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return JSON.parse(text).words ?? [];
}

// Відсіюємо дублікати і слова тесту. Приклад з іншою формою слова (worries ≠ worry) лишаємо —
// така картка просто не буде «з пропуском» (див. cardKind).
function clean(list, seen) {
  return list.filter((w) => {
    const word = String(w.word ?? "").trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key) || EXCLUDE.has(key)) return false;
    if (!w.translation || !w.transcription) return false;
    seen.add(key);
    w.word = word;
    w.transcription = String(w.transcription).replace(/^[/[]|[/\]]$/g, "");
    return true;
  });
}

function load(file) {
  const path = new URL(file, OUT);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { batches: {} };
}

function save(file, data) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL(file, OUT), JSON.stringify(data, null, 1) + "\n");
}

async function run(file, jobs) {
  const data = load(file);
  const seen = new Set(Object.values(data.batches).flat().map((w) => w.word.toLowerCase()));
  for (const [key, prompt, extra] of jobs) {
    const words = data.batches[key] ?? [];
    // Claude повторює слова між діапазонами — дозапитуємо, показуючи вже взяті
    for (let attempt = 0; words.length < MIN_PER_BATCH && attempt < 3; attempt++) {
      const avoid = attempt === 0 && words.length === 0 ? "" : `
Do NOT use any of these words: ${[...seen].join(", ")}.`;
      const more = clean(await ask(prompt + avoid), seen).map((w) => ({ ...w, ...extra }));
      words.push(...more.slice(0, PER_BATCH - words.length));
      data.batches[key] = words;
      save(file, data);
      console.log(`${file} ${key}: ${words.length}`);
    }
  }
}

const which = process.argv[2];

if (!which || which === "everyday") {
  await run(
    "everyday.json",
    EVERYDAY_BANDS.map(([from, to]) => [
      `${from}-${to}`,
      `Give ${PER_BATCH} English words whose rank in a general lemma frequency list (COCA/BNC style) is between ${from} and ${to}. ` +
        `Everyday adult life: home, shopping, health, travel, feelings, relationships, money, city, work in general. ` +
        `No IT jargon, no proper nouns, no very basic function words. Mix nouns, verbs, adjectives and a few phrasal verbs. ` +
        `freq_rank must be inside ${from}–${to}.`,
      { topic: null },
    ]),
  );
}

if (!which || which === "it") {
  await run(
    "it.json",
    Object.entries(IT_TOPICS).map(([topic, desc]) => [
      topic,
      `Give ${PER_BATCH} English words and short fixed phrases a junior backend developer needs at work. Topic: ${desc}. ` +
        `Skip words a B1 developer surely knows (code, bug, file, server, test). Include collocations people actually say ` +
        `(e.g. "roll back", "edge case", "push back on"). Mix difficulty B1–C1. freq_rank = rank of the word in GENERAL English.`,
      { topic },
    ]),
  );
}
