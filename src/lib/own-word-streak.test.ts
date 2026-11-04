import { describe, expect, it } from "vitest";
import { normalizeContext, normalizeOwnWord, parseOwnWord } from "./own-word";
import { EMPTY_STREAK, applyActivity, daysBetween, viewStreak, type Streak } from "./streak";

describe("normalizeOwnWord", () => {
  it("cleans quotes, spaces and case", () => {
    expect(normalizeOwnWord('  "Deprecate"  ')).toBe("Deprecate");
    expect(normalizeOwnWord("RATE   LIMIT")).toBe("rate limit");
    expect(normalizeOwnWord("look  forward to.")).toBe("look forward to");
    expect(normalizeOwnWord("don’t")).toBe("don't");
  });
  it("rejects non-English and long input", () => {
    expect(normalizeOwnWord("привіт")).toBeNull();
    expect(normalizeOwnWord("")).toBeNull();
    expect(normalizeOwnWord("one two three four five six")).toBeNull();
    expect(normalizeOwnWord("a".repeat(61))).toBeNull();
    expect(normalizeOwnWord(42)).toBeNull();
    expect(normalizeOwnWord("drop table; --")).toBeNull();
  });
  it("trims context", () => {
    expect(normalizeContext("  We need to   deprecate v1. ")).toBe("We need to deprecate v1.");
    expect(normalizeContext("   ")).toBeNull();
  });
});

describe("parseOwnWord", () => {
  const ok = { ok: true, word: "deprecate", translation: "оголосити застарілим", transcription: "/ˈdeprəkeɪt/", example: "We will deprecate this endpoint next month." };
  it("parses a valid answer and strips slashes", () => {
    expect(parseOwnWord(JSON.stringify(ok))).toEqual({
      word: "deprecate", translation: "оголосити застарілим", transcription: "ˈdeprəkeɪt", example: ok.example,
    });
  });
  it("drops an example that does not contain the word", () => {
    expect(parseOwnWord(JSON.stringify({ ...ok, example: "They removed the old endpoint." }))?.example).toBe("");
  });
  it("returns null for not-a-word or broken JSON", () => {
    expect(parseOwnWord(JSON.stringify({ ...ok, ok: false }))).toBeNull();
    expect(parseOwnWord(JSON.stringify({ ...ok, translation: "" }))).toBeNull();
    expect(parseOwnWord("not json")).toBeNull();
  });
});

describe("streak", () => {
  const s = (p: Partial<Streak>): Streak => ({ ...EMPTY_STREAK, ...p });

  it("counts days between local dates across month end", () => {
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1);
  });
  it("starts at 1 and is idempotent within a day", () => {
    const a = applyActivity(EMPTY_STREAK, "2026-11-04");
    expect(a).toMatchObject({ current: 1, best: 1, last_active: "2026-11-04" });
    expect(applyActivity(a, "2026-11-04")).toBe(a);
  });
  it("continues on the next day", () => {
    expect(applyActivity(s({ current: 3, best: 3, last_active: "2026-11-03" }), "2026-11-04").current).toBe(4);
  });
  it("uses a freeze for one missed day, resets when freezes are not enough", () => {
    const kept = applyActivity(s({ current: 5, best: 5, freezes: 1, last_active: "2026-11-02" }), "2026-11-04");
    expect(kept).toMatchObject({ current: 6, freezes: 0 });
    const lost = applyActivity(s({ current: 5, best: 5, freezes: 1, last_active: "2026-11-01" }), "2026-11-04");
    expect(lost).toMatchObject({ current: 1, best: 5, freezes: 1 });
  });
  it("earns a freeze every 7 days, capped at 2", () => {
    expect(applyActivity(s({ current: 6, best: 6, freezes: 0, last_active: "2026-11-03" }), "2026-11-04").freezes).toBe(1);
    expect(applyActivity(s({ current: 13, best: 13, freezes: 2, last_active: "2026-11-03" }), "2026-11-04").freezes).toBe(2);
  });
  it("view: alive with frozen days, broken after too many", () => {
    expect(viewStreak(s({ current: 4, last_active: "2026-11-04" }), "2026-11-04")).toMatchObject({ current: 4, doneToday: true });
    expect(viewStreak(s({ current: 4, last_active: "2026-11-03" }), "2026-11-04")).toMatchObject({ current: 4, doneToday: false, frozenDays: 0 });
    expect(viewStreak(s({ current: 4, freezes: 1, last_active: "2026-11-02" }), "2026-11-04")).toMatchObject({ current: 4, frozenDays: 1 });
    expect(viewStreak(s({ current: 4, freezes: 1, last_active: "2026-11-01" }), "2026-11-04").current).toBe(0);
    expect(viewStreak(EMPTY_STREAK, "2026-11-04").current).toBe(0);
  });
});
