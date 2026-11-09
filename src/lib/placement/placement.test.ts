import { canAssessWriting } from "./writing";
import { describe, expect, it } from "vitest";
import { publicVocabItems, scoreVocab, VOCAB_ITEMS, vocabCefr } from "./vocab";
import {
  currentLevel, GRAMMAR_BANK, GRAMMAR_QUESTIONS_TOTAL, nextQuestion, scoreGrammar, validateHistory, type Answer,
} from "./grammar";
import { readingTextFor, scoreReading } from "./reading";
import { parseWritingResult } from "./writing";

const real = VOCAB_ITEMS.filter((i) => i.band !== null);
const pseudo = VOCAB_ITEMS.filter((i) => i.band === null);
const yes = (items: { id: string }[]) => Object.fromEntries(items.map((i) => [i.id, true]));

describe("vocab", () => {
  it("40 справжніх слів у 10 діапазонах + 10 псевдослів", () => {
    expect(real).toHaveLength(40);
    expect(pseudo).toHaveLength(10);
    expect(new Set(VOCAB_ITEMS.map((i) => i.id)).size).toBe(50);
  });

  it("клієнт не бачить, які слова вигадані", () => {
    const items = publicVocabItems();
    expect(items).toHaveLength(50);
    expect(items.every((i) => Object.keys(i).sort().join() === "id,word" && /^w[0-9a-z]+$/.test(i.id))).toBe(true);
  });

  it("знає все справжнє, без псевдослів → 10000, C1", () => {
    expect(scoreVocab(yes(real))).toMatchObject({ size: 10000, cefr: "C1", falseAlarm: 0 });
  });

  it("перші 3 діапазони → 3000, B1", () => {
    expect(scoreVocab(yes(real.filter((i) => i.band! <= 3)))).toMatchObject({ size: 3000, cefr: "B1" });
  });

  it("«так» на все → 0 (вгадування не рахується)", () => {
    expect(scoreVocab(yes(VOCAB_ITEMS))).toMatchObject({ size: 0, cefr: "A1", falseAlarm: 1 });
  });

  it("псевдослова штрафують: 5 діапазонів + половина псевдослів → (1−0.5)/(1−0.5)·5000 мінус 0 для решти", () => {
    const known = { ...yes(real.filter((i) => i.band! <= 5)), ...yes(pseudo.slice(0, 5)) };
    // f = 0.5: повні діапазони → 1, порожні → max(0, −1) = 0
    expect(scoreVocab(known).size).toBe(5000);
    const partial = { ...yes(real.filter((i) => i.band === 1).slice(0, 3)), ...yes(pseudo.slice(0, 2)) };
    // h = 0.75, f = 0.2 → (0.55/0.8)·1000 = 687.5
    expect(scoreVocab(partial).size).toBe(688);
  });

  it("пороги CEFR", () => {
    expect([999, 1000, 1999, 2000, 3249, 3250, 4999, 5000].map(vocabCefr)).toEqual(["A1", "A2", "A2", "B1", "B1", "B2", "B2", "C1"]);
  });
});

const byId = new Map(GRAMMAR_BANK.map((q) => [q.id, q]));
/** Проходить тест, відповідаючи за правилом `correct(question)`. */
function run(correct: (level: string, i: number) => boolean): Answer[] {
  const history: Answer[] = [];
  for (let i = 0; ; i++) {
    const q = nextQuestion(history);
    if (!q) break;
    const ok = correct(q.level, i);
    history.push({ id: q.id, choice: ok ? q.answer : (q.answer + 1) % q.options.length });
  }
  return history;
}

describe("grammar", () => {
  it("банк: 28 питань по 7 на рівень, унікальні id, правильна відповідь у межах", () => {
    expect(GRAMMAR_BANK).toHaveLength(28);
    expect(new Set(GRAMMAR_BANK.map((q) => q.id)).size).toBe(28);
    for (const lvl of ["A2", "B1", "B2", "C1"]) expect(GRAMMAR_BANK.filter((q) => q.level === lvl)).toHaveLength(7);
    expect(GRAMMAR_BANK.every((q) => q.answer >= 0 && q.answer < q.options.length && q.prompt.includes("___"))).toBe(true);
  });

  it("старт з B1, правильно → вгору, неправильно → вниз", () => {
    const first = nextQuestion([])!;
    expect(first.level).toBe("B1");
    const right = { id: first.id, choice: first.answer };
    expect(currentLevel([right])).toBe("B2");
    expect(currentLevel([{ id: first.id, choice: (first.answer + 1) % 4 }])).toBe("A2");
  });

  it(`рівно ${GRAMMAR_QUESTIONS_TOTAL} питань без повторів, далі done`, () => {
    const h = run(() => true);
    expect(h).toHaveLength(GRAMMAR_QUESTIONS_TOTAL);
    expect(new Set(h.map((a) => a.id)).size).toBe(GRAMMAR_QUESTIONS_TOTAL);
    expect(nextQuestion(h)).toBeNull();
  });

  it("усе правильно → C1; усе неправильно → A2", () => {
    expect(scoreGrammar(run(() => true)).level).toBe("C1");
    const allWrong = scoreGrammar(run(() => false));
    expect(allWrong).toMatchObject({ level: "A2", correct: 0 });
    expect(allWrong.weakTopics.length).toBeGreaterThan(0);
  });

  it("знає до B1 включно, B2+ не знає → B1, а слабкі теми — з B2", () => {
    const h = run((level) => level === "A2" || level === "B1");
    const r = scoreGrammar(h);
    expect(r.level).toBe("B1");
    const b2Topics = new Set(GRAMMAR_BANK.filter((q) => q.level === "B2").map((q) => q.topic));
    expect(r.weakTopics.every((t) => b2Topics.has(t.topic) || t.score < 1)).toBe(true);
    expect(r.weakTopics.some((t) => b2Topics.has(t.topic))).toBe(true);
  });

  it("слабкі теми відсортовані від найгіршої", () => {
    const r = scoreGrammar(run((_, i) => i % 3 !== 0));
    const scores = r.weakTopics.map((t) => t.score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  it("validateHistory відкидає сміття", () => {
    const q = GRAMMAR_BANK[0];
    expect(validateHistory([])).toBe(true);
    expect(validateHistory([{ id: q.id, choice: 0 }])).toBe(true);
    expect(validateHistory("x")).toBe(false);
    expect(validateHistory([{ id: "nope", choice: 0 }])).toBe(false);
    expect(validateHistory([{ id: q.id, choice: 9 }])).toBe(false);
    expect(validateHistory([{ id: q.id, choice: 1.5 }])).toBe(false);
    expect(validateHistory([{ id: q.id, choice: 0 }, { id: q.id, choice: 1 }])).toBe(false);
    expect(validateHistory(GRAMMAR_BANK.slice(0, 13).map((x) => ({ id: x.id, choice: 0 })))).toBe(false);
  });

  it("історія з довільними id — рівень рахується за справжнім рівнем питання", () => {
    const b2 = GRAMMAR_BANK.filter((q) => q.level === "B2").slice(0, 2).map((q) => ({ id: q.id, choice: q.answer }));
    expect(scoreGrammar(b2).level).toBe("B2");
    expect(byId.size).toBe(28);
  });
});

describe("reading", () => {
  it("текст за граматикою", () => {
    expect(readingTextFor("A2").level).toBe("B1");
    expect(readingTextFor("B1").level).toBe("B1");
    expect(readingTextFor("B2").level).toBe("B2");
    expect(readingTextFor("C1").level).toBe("B2");
  });

  it("≥2/3 → рівень тексту, інакше на рівень нижче", () => {
    expect(scoreReading("B2", [1, 2, 3])).toEqual({ level: "B2", correct: 3 });
    expect(scoreReading("B2", [1, 2, 0])).toEqual({ level: "B2", correct: 2 });
    expect(scoreReading("B2", [1, 0, 0])).toEqual({ level: "B1", correct: 1 });
    expect(scoreReading("B1", [0, 1, 0])).toEqual({ level: "A2", correct: 0 });
  });
});

describe("writing", () => {
  it("розбирає JSON, навіть у code fence", () => {
    const r = parseWritingResult('```json\n{"cefr":"B1","errors":[{"original":"I am work","corrected":"I work","explanation":"Present Simple","topic":"Present Simple"}]}\n```');
    expect(r).toEqual({ cefr: "B1", errors: [{ original: "I am work", corrected: "I work", explanation: "Present Simple", topic: "present_simple" }] });
  });

  it("відкидає кривий формат і неповні помилки", () => {
    expect(parseWritingResult("no json")).toBeNull();
    expect(parseWritingResult('{"cefr":"X9","errors":[]}')).toBeNull();
    expect(parseWritingResult('{"cefr":"B2","errors":[{"original":"a"}, "str", null]}')).toEqual({ cefr: "B2", errors: [] });
  });
});

describe("canAssessWriting", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  it("allows the first test and a test after a day", () => {
    expect(canAssessWriting(null, now)).toBe(true);
    expect(canAssessWriting("2026-11-08T12:00:00Z", now)).toBe(true);
  });
  it("blocks a repeat within a day", () => {
    expect(canAssessWriting("2026-11-09T01:00:00Z", now)).toBe(false);
  });
});
