import { describe, expect, it, vi } from "vitest";
import { buildDictIndex, coverage, dictionaryErrors, findInDict, loadDictionaryFrom, type DictFile } from "./dictionary";
import { findTranslation, type WordRow } from "./lookup";
import { prepareCard } from "./card";
import { runAddReadingCard, type CardStore, type StoredCard } from "./add-card";
import type { ReadingText } from "./schema";

const FILE: DictFile = {
  entries: [
    { lemma: "go", forms: ["go", "goes", "went", "gone"], translation: "йти, їхати", transcription: "/ɡəʊ/" },
    { lemma: "tired", forms: ["tired"], translation: "втомлений", transcription: "/ˈtaɪəd/" },
  ],
  untranslated: ["dan"],
};
const dict = buildDictIndex(FILE);

const row = (id: number, word: string, set_name: string): WordRow => ({
  id, word, translation: `tr-${id}`, transcription: null, example: "ex", set_name,
});

const text = (t: string, glossary: ReadingText["glossary"] = [{ lemma: "deploy", forms: ["deployed"], translation: "розгортати" }]): ReadingText => ({
  id: "rb-b1-01", level: "B1", topic: "devops", title: "T", text: t, glossary,
  questions: [
    { prompt: "Q1?", options: ["a", "b", "c"], answer: 1, explanation: "x" },
    { prompt: "Q2?", options: ["a", "b", "c"], answer: 0, explanation: "y" },
  ],
});

describe("словник: схема", () => {
  it("валідний файл → без помилок", () => {
    expect(dictionaryErrors(FILE)).toEqual([]);
  });
  it("не об'єкт, немає entries/untranslated → помилки", () => {
    expect(dictionaryErrors(null).length).toBeGreaterThan(0);
    expect(dictionaryErrors({ entries: "x", untranslated: [] }).length).toBeGreaterThan(0);
    expect(dictionaryErrors({ entries: [], untranslated: "x" }).length).toBeGreaterThan(0);
  });
  it("порожня lemma, forms, translation без кирилиці, порожня transcription", () => {
    const bad = (e: object) => dictionaryErrors({ entries: [{ lemma: "a", forms: ["a"], translation: "а", transcription: "/a/", ...e }], untranslated: [] });
    expect(bad({ lemma: " " }).length).toBeGreaterThan(0);
    expect(bad({ forms: [] }).length).toBeGreaterThan(0);
    expect(bad({ forms: ["a", ""] }).length).toBeGreaterThan(0);
    expect(bad({ translation: "go" }).length).toBeGreaterThan(0);
    expect(bad({ transcription: "" }).length).toBeGreaterThan(0);
    expect(bad({}).length).toBe(0);
  });
  it("одна форма у двох записах (без регістру) → помилка", () => {
    const f = { entries: [FILE.entries[0], { lemma: "Went", forms: ["WENT"], translation: "пішов", transcription: "/x/" }], untranslated: [] };
    expect(dictionaryErrors(f).join(" ")).toMatch(/went/i);
  });
});

describe("словник: пошук і завантаження", () => {
  it("без регістру; went → лема go; невідомо → null", () => {
    expect(findInDict(dict, "WENT")?.lemma).toBe("go");
    expect(findInDict(dict, "Tired")?.translation).toBe("втомлений");
    expect(findInDict(dict, "zzz")).toBeNull();
  });
  it("loadDictionaryFrom: немає файлу → порожній словник без логу", () => {
    const log = vi.fn();
    expect(findInDict(loadDictionaryFrom(() => null, log), "go")).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });
  it("loadDictionaryFrom: зламаний JSON, невалідна схема, помилка читання → лог і порожній словник", () => {
    const reads = [
      () => "{oops",
      () => JSON.stringify({ entries: [{ lemma: "" }], untranslated: [] }),
      () => {
        throw new Error("EIO");
      },
    ];
    for (const read of reads) {
      const log = vi.fn();
      const idx = loadDictionaryFrom(read, log);
      expect(findInDict(idx, "go")).toBeNull();
      expect(log).toHaveBeenCalledTimes(1);
    }
  });
  it("loadDictionaryFrom: валідний файл читається", () => {
    const log = vi.fn();
    expect(findInDict(loadDictionaryFrom(() => JSON.stringify(FILE), log), "went")?.lemma).toBe("go");
    expect(log).not.toHaveBeenCalled();
  });
});

describe("пошук перекладу: пріоритет із словником", () => {
  const g = [{ lemma: "deploy", forms: ["went"], translation: "з глосарію" }];
  it("глосарій > words > словник > null", () => {
    expect(findTranslation(g, [row(1, "went", "it")], "went", dict)?.source).toBe("glossary");
    expect(findTranslation([], [row(1, "went", "it")], "went", dict)?.source).toBe("words");
    expect(findTranslation([], [], "went", dict)).toMatchObject({ source: "dictionary", lemma: "go", translation: "йти, їхати", transcription: "/ɡəʊ/", row: null });
    expect(findTranslation([], [], "zzz", dict)).toBeNull();
  });
  it("без регістру і без словника працює як раніше", () => {
    expect(findTranslation([], [], "WENT", dict)?.lemma).toBe("go");
    expect(findTranslation([], [], "went")).toBeNull();
  });
});

describe("покриття", () => {
  const t = text("We went home. Dan deployed it, and tired people left!");
  const words = new Set(["home", "it", "and", "people", "we"]);
  it("усе покрито → без пропусків", () => {
    expect(coverage([t], dict, words, ["left", "dan"]).missing).toEqual([]);
  });
  it("слово без перекладу → у missing з textId; регістр не важливий", () => {
    expect(coverage([t], dict, words, ["dan"]).missing).toEqual([{ textId: t.id, word: "left" }]);
  });
  it("глосарій діє лише у своєму тексті", () => {
    const a = text("We deployed it.");
    const b = { ...text("We deployed it."), id: "rb-b1-02", glossary: [{ lemma: "x", forms: ["we"], translation: "ми" }] };
    const r = coverage([a, b], buildDictIndex({ entries: [], untranslated: [] }), new Set(["it"]), []);
    expect(r.missing).toEqual([
      { textId: "rb-b1-01", word: "we" },
      { textId: "rb-b1-02", word: "deployed" },
    ]);
  });
  it("частка untranslated від унікальних слів", () => {
    const r = coverage([t], dict, words, ["left", "dan"]);
    expect(r.uniqueWords).toBe(10);
    expect(r.untranslatedRatio).toBeCloseTo(2 / 10);
  });
});

describe("«+» для слова зі словника", () => {
  const t = text("We went home. We deployed it.");
  const body = (o: object) => ({ textId: t.id, word: "went", sentence: "We went home.", ...o });

  it("словник → план за лемою зі словником (не invalid)", () => {
    expect(prepareCard(t, body({}), [], dict)).toMatchObject({
      status: "ok",
      plan: { kind: "dictionary", form: "went", lemma: "go", translation: "йти, їхати", transcription: "/ɡəʊ/", sentence: "We went home." },
    });
  });
  it("без словника went → invalid (як раніше)", () => {
    expect(prepareCard(t, body({}), []).status).toBe("invalid");
  });
  it("речення з іншого тексту або без натиснутої форми → invalid", () => {
    expect(prepareCard(t, body({ sentence: "They went away." }), [], dict).status).toBe("invalid");
    expect(prepareCard(t, body({ sentence: "We deployed it." }), [], dict).status).toBe("invalid");
  });
  it("глосарій і words мають пріоритет над словником", () => {
    const gt = text("We went home.", [{ lemma: "walk", forms: ["went"], translation: "ходити" }]);
    expect(prepareCard(gt, { textId: gt.id, word: "went", sentence: "We went home." }, [], dict)).toMatchObject({ plan: { kind: "glossary", lemma: "walk" } });
    expect(prepareCard(t, body({}), [row(5, "went", "everyday")], dict)).toMatchObject({ plan: { kind: "words", row: { id: 5 } } });
  });
  it("лема словника є в words → рядок words за pickWordRow, не друга картка", () => {
    const r = prepareCard(t, body({}), [], dict, [row(9, "go", "everyday"), row(2, "go", "it")]);
    expect(r).toMatchObject({ status: "ok", plan: { kind: "words", row: { id: 2 }, form: "went", sentence: "We went home." } });
  });

  function fakeStore() {
    const cards: StoredCard[] = [];
    const store: CardStore = {
      async findUserCard(w) {
        return cards.find((c) => c.word.toLowerCase() === w.toLowerCase()) ?? null;
      },
      async insertWordCard(r, example) {
        cards.push({ word: r.word, translation: r.translation, transcription: r.transcription, example, wordId: r.id });
      },
      async insertOwnCard(c) {
        cards.push({ ...c, wordId: null });
      },
    };
    return { cards, store };
  }
  it("власна картка за лемою, example = речення; повтор і інша форма → exists", async () => {
    const { cards, store } = fakeStore();
    const p = prepareCard(t, body({}), [], dict);
    if (p.status !== "ok") throw new Error("plan");
    expect((await runAddReadingCard(store, p.plan)).status).toBe("added");
    expect(cards).toEqual([{ word: "go", translation: "йти, їхати", transcription: "/ɡəʊ/", example: "We went home.", wordId: null }]);
    expect((await runAddReadingCard(store, p.plan)).status).toBe("exists");
    const t2 = text("They go home.");
    const p2 = prepareCard(t2, { textId: t2.id, word: "go", sentence: "They go home." }, [], dict);
    if (p2.status !== "ok") throw new Error("plan");
    expect((await runAddReadingCard(store, p2.plan)).status).toBe("exists");
    expect(cards).toHaveLength(1);
  });
});
