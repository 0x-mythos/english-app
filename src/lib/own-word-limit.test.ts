import { describe, expect, it } from "vitest";
import { createDailyLimiter, OWN_WORD_DAILY_LIMIT } from "./own-word-limit";
import { runAddOwnWord, type OwnWordDeps } from "./own-word-flow";
import type { OwnWordInfo } from "./own-word";

const CARD: OwnWordInfo = { word: "deploy", translation: "розгортати", transcription: "x", example: "We deploy." };

function deps(over: Partial<OwnWordDeps> = {}) {
  const calls = { claude: 0, inserted: 0 };
  const d: OwnWordDeps = {
    findUserCard: async () => null,
    addFromSet: async () => null,
    askClaude: async () => {
      calls.claude++;
      return CARD;
    },
    insertCard: async () => {
      calls.inserted++;
    },
    takeLimit: async () => true,
    ...over,
  };
  return { d, calls };
}

describe("лічильник", () => {
  it("ліміт 30 на користувача за дату", () => {
    expect(OWN_WORD_DAILY_LIMIT).toBe(30);
    const l = createDailyLimiter(30);
    for (let i = 0; i < 30; i++) expect(l.take("u1", "2026-11-08")).toBe(true);
    expect(l.take("u1", "2026-11-08")).toBe(false);
    expect(l.take("u2", "2026-11-08")).toBe(true);
  });
  it("наступної доби — заново", () => {
    const l = createDailyLimiter(2);
    l.take("u", "2026-11-08");
    l.take("u", "2026-11-08");
    expect(l.take("u", "2026-11-08")).toBe(false);
    expect(l.take("u", "2026-11-09")).toBe(true);
  });
});

describe("addOwnWord: ліміт", () => {
  it("31-й виклик Claude → limit без виклику Claude", async () => {
    const limiter = createDailyLimiter(30);
    const { d, calls } = deps({ takeLimit: async (u) => limiter.take(u, "d") });
    for (let i = 0; i < 30; i++) expect((await runAddOwnWord(d, "u", `word${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, null)).status).toBe("added");
    expect(calls.claude).toBe(30);
    expect((await runAddOwnWord(d, "u", "another", null)).status).toBe("limit");
    expect(calls.claude).toBe(30);
  });
  it("not_a_word і ai_error теж рахуються", async () => {
    const limiter = createDailyLimiter(2);
    let n = 0;
    const { d } = deps({ takeLimit: async (u) => limiter.take(u, "d"), askClaude: async () => (n++ === 0 ? "not_a_word" : "ai_error") });
    expect((await runAddOwnWord(d, "u", "asdf", null)).status).toBe("not_a_word");
    expect((await runAddOwnWord(d, "u", "asdg", null)).status).toBe("ai_error");
    expect((await runAddOwnWord(d, "u", "asdh", null)).status).toBe("limit");
  });
  it("слово з words і дубль ліміт не витрачають", async () => {
    let taken = 0;
    const take = async () => {
      taken++;
      return true;
    };
    const a = deps({ takeLimit: take, addFromSet: async () => CARD });
    expect((await runAddOwnWord(a.d, "u", "deploy", null)).status).toBe("added");
    const b = deps({ takeLimit: take, findUserCard: async () => CARD });
    expect((await runAddOwnWord(b.d, "u", "deploy", null)).status).toBe("exists");
    expect(taken).toBe(0);
  });
  it("invalid без ліміту й без Claude", async () => {
    const { d, calls } = deps();
    expect((await runAddOwnWord(d, "u", "привіт", null)).status).toBe("invalid");
    expect(calls.claude).toBe(0);
  });
  it("виправлена Claude форма, що вже є в картках → exists", async () => {
    let first = true;
    const { d, calls } = deps({
      findUserCard: async () => {
        if (first) {
          first = false;
          return null;
        }
        return CARD;
      },
    });
    expect((await runAddOwnWord(d, "u", "deplyo", null)).status).toBe("exists");
    expect(calls.inserted).toBe(0);
  });
});
