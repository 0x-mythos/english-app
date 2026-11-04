import { describe, expect, it } from "vitest";
import {
  bankErrors, bankTopicOf, checkBankAnswer, checkOwnAnswer, norm, pickDrills, topicPriorities,
  type AttemptRow, type BankTopic, type MistakeRow,
} from "./drills";

const now = new Date("2026-11-04T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

function topic(name: string, n = 6): BankTopic {
  return {
    topic: name, title: name, rule: "rule",
    items: Array.from({ length: n }, (_, i) => ({
      id: `${name}-${String(i + 1).padStart(2, "0")}`, level: i % 2 ? "B1" : "B2", type: "choice" as const,
      prompt: "I ___ it.", options: ["do", "does", "did"], answer: 0, explanation: "x",
    })),
  };
}
const bank = new Map(["articles", "prepositions", "present_perfect", "passive"].map((t) => [t, topic(t)]));
const known = new Set(bank.keys());
const mistake = (id: number, t: string, age = 1, kind = "grammar"): MistakeRow =>
  ({ id, kind, topic: t, original: `bad ${id}`, corrected: `good ${id}`, explanation: null, created_at: daysAgo(age) });
const seq = () => { let i = 0; return () => ((i++ * 0.37) % 1); };

describe("bankTopicOf", () => {
  it("знає теми, синоніми і вкладені назви; лексику відкидає", () => {
    expect(bankTopicOf("articles", known)).toBe("articles");
    expect(bankTopicOf("Article", known)).toBe("articles");
    expect(bankTopicOf("wrong_preposition", known)).toBe("prepositions");
    expect(bankTopicOf("passive_voice", known)).toBe("passive");
    expect(bankTopicOf("vocabulary", known)).toBeNull();
    expect(bankTopicOf("other", known)).toBeNull();
  });
});

describe("topicPriorities", () => {
  it("свіжі помилки важать більше за старі, лексика не рахується", () => {
    const p = topicPriorities({
      weak: [], known, now, attempts: [],
      mistakes: [mistake(1, "articles", 1), mistake(2, "articles", 2), mistake(3, "prepositions", 60), mistake(4, "vocabulary", 0, "vocab")],
    });
    expect(p).toEqual(["articles", "prepositions"]);
  });

  it("слабка тема тесту + успішні дрили опускають тему", () => {
    const attempts: AttemptRow[] = Array.from({ length: 5 }, (_, i) => ({ item_id: `articles-0${i}`, topic: "articles", correct: true, created_at: daysAgo(1) }));
    const p = topicPriorities({
      weak: [{ topic: "articles", score: 0.5 }, { topic: "passive", score: 0.2 }], mistakes: [], attempts, known, now,
    });
    expect(p[0]).toBe("passive");
  });

  it("без даних — базові теми B1", () => {
    expect(topicPriorities({ weak: [], mistakes: [], attempts: [], known, now })).toEqual(["articles", "present_perfect", "prepositions"]);
  });
});

describe("pickDrills", () => {
  const base = { bank, mistakes: [] as MistakeRow[], attempts: [] as AttemptRow[], level: "B1" as const, now, rng: seq() };

  it("бере дві топ-теми, чергує їх і тримає ліміт", () => {
    const d = pickDrills({ ...base, priorities: ["passive", "articles", "prepositions"], limit: 6 });
    expect(d).toHaveLength(6);
    expect(new Set(d.map((x) => x.topic))).toEqual(new Set(["passive", "articles"]));
    expect(d[0].topic).not.toBe(d[1].topic);
    expect(d.every((x) => !("answer" in x) && !("explanation" in x))).toBe(true);
  });

  it("третина — власні речення, вже виправлені не повторюються", () => {
    const mistakes = [mistake(1, "articles"), mistake(2, "articles"), mistake(3, "passive")];
    const attempts: AttemptRow[] = [{ item_id: "m1", topic: "articles", correct: true, created_at: daysAgo(2) }];
    const d = pickDrills({ ...base, mistakes, attempts, priorities: ["articles"], limit: 6 });
    const own = d.filter((x) => x.type === "own").map((x) => x.id);
    expect(own).toEqual(["m2", "m3"]);
    expect(d).toHaveLength(6);
  });

  it("пропускає зроблене правильно за 30 днів і сьогоднішнє; спершу ті, де помилявся", () => {
    const attempts: AttemptRow[] = [
      { item_id: "articles-01", topic: "articles", correct: true, created_at: daysAgo(3) },
      { item_id: "articles-02", topic: "articles", correct: false, created_at: daysAgo(3) },
    ];
    const d = pickDrills({ ...base, attempts, priorities: ["articles"], limit: 3, exclude: new Set(["articles-03"]) });
    const ids = d.map((x) => x.id);
    expect(ids[0]).toBe("articles-02");
    expect(ids).not.toContain("articles-01");
    expect(ids).not.toContain("articles-03");
  });

  it("ліміт 0 — нічого", () => {
    expect(pickDrills({ ...base, priorities: ["articles"], limit: 0 })).toEqual([]);
  });
});

describe("перевірка відповідей", () => {
  it("норма: регістр, апострофи, кінцева крапка, пробіли", () => {
    expect(norm("  I  HAVEN’T seen it . ")).toBe("i haven't seen it");
  });

  it("choice — за індексом, gap/fix — за будь-яким прийнятним варіантом", () => {
    const t = topic("articles");
    expect(checkBankAnswer(t.items[0], "0").correct).toBe(true);
    expect(checkBankAnswer(t.items[0], "1")).toMatchObject({ correct: false, expected: "do" });
    const gap = { id: "x-01", level: "B1" as const, type: "gap" as const, prompt: "She ___ (finish).", answers: ["hasn't finished", "has not finished"], explanation: "e" };
    expect(checkBankAnswer(gap, "Has not finished").correct).toBe(true);
    expect(checkBankAnswer(gap, "didn't finish")).toMatchObject({ correct: false, expected: "hasn't finished" });
  });

  it("власне речення — з виправленим варіантом", () => {
    expect(checkOwnAnswer({ corrected: "I saw him yesterday.", explanation: null }, "i saw him yesterday").correct).toBe(true);
  });
});

describe("bankErrors", () => {
  it("ловить зламані вправи", () => {
    const t = topic("articles", 2);
    expect(bankErrors(t)).toEqual([]);
    t.items[1] = { ...t.items[1], id: "articles-01", answer: 5, prompt: "no gap" };
    expect(bankErrors(t).join()).toMatch(/id.*___.*answer/);
  });
});
