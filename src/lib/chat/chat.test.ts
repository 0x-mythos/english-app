import { describe, expect, it } from "vitest";
import { MAX_CORRECTIONS, SCENARIOS, chatSystem, historyForModel, mistakeKind, parseChatReply, scenarioById } from "./chat";

const ok = {
  reply: "Nice! How long have you been working with Postgres?",
  corrections: [
    { original: "I work here since 2024", corrected: "I've been working here since 2024", explanation: "Дія триває досі → Present Perfect Continuous.", topic: "Present Perfect" },
  ],
  words: [{ word: "been working", translation: "працював (і досі)", transcription: "/biːn ˈwɜːkɪŋ/", example: "How long have you been working with Postgres?" }],
};
const userText = "Hello! I work here since 2024 and I like it.";

describe("parseChatReply", () => {
  it("parses a valid reply and normalises topic and IPA", () => {
    const r = parseChatReply(JSON.stringify(ok), userText)!;
    expect(r.reply).toBe(ok.reply);
    expect(r.corrections[0].topic).toBe("present_perfect");
    expect(r.words[0].transcription).toBe("biːn ˈwɜːkɪŋ");
  });
  it("drops corrections not taken from the user's message or unchanged", () => {
    const r = parseChatReply(
      JSON.stringify({
        ...ok,
        corrections: [
          { original: "I am engineer", corrected: "I am an engineer", explanation: "", topic: "articles" },
          { original: "I like it", corrected: "I like it", explanation: "", topic: "x" },
        ],
      }),
      userText,
    )!;
    expect(r.corrections).toEqual([]);
  });
  it(`keeps at most ${MAX_CORRECTIONS} corrections`, () => {
    const c = ok.corrections[0];
    const r = parseChatReply(JSON.stringify({ ...ok, corrections: [c, { ...c, original: "Hello" , corrected: "Hi"}, { ...c, original: "like it", corrected: "love it" }] }), userText)!;
    expect(r.corrections).toHaveLength(MAX_CORRECTIONS);
  });
  it("drops bad words and an example without the word", () => {
    const r = parseChatReply(
      JSON.stringify({ ...ok, words: [{ word: "", translation: "x", transcription: "", example: "" }, { ...ok.words[0], example: "Something else." }] }),
      userText,
    )!;
    expect(r.words).toHaveLength(1);
    expect(r.words[0].example).toBe("");
  });
  it("returns null for empty reply or broken JSON", () => {
    expect(parseChatReply(JSON.stringify({ ...ok, reply: " " }), userText)).toBeNull();
    expect(parseChatReply("{oops", userText)).toBeNull();
  });
});

describe("chat helpers", () => {
  it("history starts with a user message and is capped", () => {
    const rows = [{ role: "assistant", content: "opener" }, ...Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: String(i) }))];
    const h = historyForModel(rows);
    expect(h[0].role).toBe("user");
    expect(h.length).toBeLessThanOrEqual(16);
    expect(historyForModel([{ role: "assistant", content: "opener" }])).toEqual([]);
  });
  it("scenarios are unique and resolvable; system prompt mentions level and weak topics", () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    expect(scenarioById("standup")?.title).toBe("Стендап");
    expect(scenarioById("hack")).toBeNull();
    const sys = chatSystem(SCENARIOS[0], { grammar_level: "B2", weak_topics: [{ topic: "articles" }] });
    expect(sys).toContain("B2");
    expect(sys).toContain("articles");
  });
  it("classifies mistake kind", () => {
    expect(mistakeKind("vocabulary")).toBe("vocab");
    expect(mistakeKind("articles")).toBe("grammar");
  });
});
