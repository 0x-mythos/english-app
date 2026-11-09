import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenize";
import { findTranslation, normForm, pickWordRow, type WordRow } from "./lookup";
import { gradeAnswers, listItems, parseAnswerBody, parseCardBody, parseLookupWord, textView, findText } from "./views";
import { selectTexts, levelsFor } from "./select";
import { sentenceAt, normSpaces } from "./sentence";
import { prepareCard } from "./card";
import { runAddReadingCard, type CardStore, type StoredCard } from "./add-card";
import { textErrors, wordCount, type ReadingText } from "./schema";

const TEXT = "We deployed the fix. Then a roll-back wasn't needed!\n\nCI/CD is 100% fine, e-mail me.";

const mk = (o: Partial<ReadingText> = {}): ReadingText => ({
  id: "rb-b1-01", level: "B1", topic: "devops", title: "T",
  text: TEXT,
  glossary: [{ lemma: "deploy", forms: ["deployed"], translation: "розгортати", transcription: "dɪˈplɔɪ" }],
  questions: [
    { prompt: "Q1?", options: ["a", "b", "c"], answer: 1, explanation: "бо b" },
    { prompt: "Q2?", options: ["a", "b", "c"], answer: 0, explanation: "бо a" },
  ],
  ...o,
});

const row = (id: number, word: string, set_name: string): WordRow => ({
  id, word, translation: `tr-${id}`, transcription: null, example: "ex", set_name,
});

describe("tokenize", () => {
  it("склеювання токенів = початковий текст", () => {
    expect(tokenize(TEXT).map((t) => t.text).join("")).toBe(TEXT);
    expect(tokenize("").length).toBe(0);
  });
  it("апостроф і дефіс не розривають слово", () => {
    const words = tokenize("don't it's roll-back e-mail API's").filter((t) => t.word).map((t) => t.text);
    expect(words).toEqual(["don't", "it's", "roll-back", "e-mail", "API's"]);
  });
  it("числа й розділові знаки не клікабельні, CI/CD розбивається", () => {
    const ws = tokenize("CI/CD is 100% fine, ok.").filter((t) => t.word).map((t) => t.text);
    expect(ws).toEqual(["CI", "CD", "is", "fine", "ok"]);
  });
  it("start вказує на позицію в тексті", () => {
    for (const t of tokenize(TEXT)) expect(TEXT.slice(t.start, t.start + t.text.length)).toBe(t.text);
  });
});

describe("пошук перекладу", () => {
  const g = mk().glossary;
  it("глосарій, words, невідоме", () => {
    expect(findTranslation(g, [], "Deployed")).toMatchObject({ source: "glossary", lemma: "deploy", translation: "розгортати" });
    expect(findTranslation(g, [row(1, "went", "everyday")], "WENT")).toMatchObject({ source: "words", lemma: "went", translation: "tr-1" });
    expect(findTranslation(g, [], "zzz")).toBeNull();
  });
  it("глосарій має пріоритет над words", () => {
    expect(findTranslation(g, [row(1, "deployed", "it")], "deployed")?.source).toBe("glossary");
  });
  it("normForm: типографський апостроф і регістр", () => {
    expect(normForm("Don’t")).toBe("don't");
  });
});

describe("вибір рядка words", () => {
  it("спершу it, потім менший id", () => {
    expect(pickWordRow([row(5, "run", "everyday"), row(9, "run", "it")])?.id).toBe(9);
    expect(pickWordRow([row(9, "run", "everyday"), row(5, "run", "everyday")])?.id).toBe(5);
    expect(pickWordRow([row(9, "run", "it"), row(5, "run", "it")])?.id).toBe(5);
    expect(pickWordRow([])).toBeNull();
  });
  it("не залежить від порядку рядків", () => {
    const a = [row(5, "x", "everyday"), row(9, "x", "it"), row(2, "x", "it")];
    expect(pickWordRow(a)?.id).toBe(pickWordRow([...a].reverse())?.id);
  });
});

describe("вибір і порядок текстів", () => {
  const texts = [
    mk({ id: "a-b1-everyday", level: "B1", topic: "everyday" }),
    mk({ id: "b-b2-it", level: "B2", topic: "api" }),
    mk({ id: "c-b1-it", level: "B1", topic: "devops" }),
    mk({ id: "d-b2-everyday", level: "B2", topic: "everyday" }),
  ];
  it("рівні", () => {
    expect(levelsFor(null)).toEqual(["B1", "B2"]);
    expect(levelsFor("A2")).toEqual(["B1", "B2"]);
    expect(levelsFor("B1")).toEqual(["B1", "B2"]);
    expect(levelsFor("B2")).toEqual(["B2"]);
    expect(levelsFor("C1")).toEqual(["B2"]);
    expect(levelsFor("???")).toEqual(["B1", "B2"]);
  });
  it("B2+ бачить лише B2", () => {
    expect(selectTexts(texts, "C1", []).map((t) => t.level)).toEqual(["B2", "B2"]);
  });
  it("тексти з темою з goals першими", () => {
    expect(selectTexts(texts, null, ["it"]).map((t) => t.id)).toEqual(["b-b2-it", "c-b1-it", "a-b1-everyday", "d-b2-everyday"]);
    expect(selectTexts(texts, null, ["everyday"]).map((t) => t.id)).toEqual(["a-b1-everyday", "d-b2-everyday", "b-b2-it", "c-b1-it"]);
  });
  it("без goals порядок за id", () => {
    expect(selectTexts(texts, null, []).map((t) => t.id)).toEqual(["a-b1-everyday", "b-b2-it", "c-b1-it", "d-b2-everyday"]);
  });
});

describe("речення-контекст", () => {
  it("береться речення з натиснутим словом", () => {
    expect(sentenceAt(TEXT, TEXT.indexOf("roll-back"))).toBe("Then a roll-back wasn't needed!");
    expect(sentenceAt(TEXT, TEXT.indexOf("deployed"))).toBe("We deployed the fix.");
  });
  it("абзац відділяє речення", () => {
    expect(sentenceAt(TEXT, TEXT.indexOf("CI/CD"))).toBe("CI/CD is 100% fine, e-mail me.");
  });
  it("обрізається до 300 символів і лишається підрядком, зі словом", () => {
    const long = "word ".repeat(120) + "TARGET " + "tail ".repeat(60) + "end.";
    const s = sentenceAt(long, long.indexOf("TARGET"));
    expect(s.length).toBeLessThanOrEqual(300);
    expect(s).toContain("TARGET");
    expect(long.includes(s)).toBe(true);
  });
  it("normSpaces", () => {
    expect(normSpaces("  a \n b ")).toBe("a b");
  });
});

describe("схема тексту (валідатор)", () => {
  const filler = (n: number) =>
    Array.from({ length: n }, (_, i) => `w${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + (Math.floor(i / 26) % 26))}`).join(" ");
  const good = (): ReadingText => mk({ text: `We deployed it. ${filler(140)}.` });
  it("валідний текст проходить", () => {
    expect(textErrors(good(), "rb-b1-01")).toEqual([]);
  });
  it("id має збігатися з іменем файлу, рівень і тема допустимі", () => {
    expect(textErrors(good(), "other").length).toBeGreaterThan(0);
    expect(textErrors({ ...good(), level: "C1" }, "rb-b1-01").length).toBeGreaterThan(0);
    expect(textErrors({ ...good(), topic: "cooking" }, "rb-b1-01").length).toBeGreaterThan(0);
  });
  it("кількість слів 120–220", () => {
    expect(textErrors(mk({ text: "We deployed it." }), "rb-b1-01").join()).toMatch(/слів/);
    expect(textErrors(mk({ text: `We deployed it. ${filler(300)}.` }), "rb-b1-01").join()).toMatch(/слів/);
    expect(wordCount("a b-c d's 12")).toBe(3);
  });
  it("питання: 2–3, 3–4 різні варіанти, answer у межах", () => {
    const g = good();
    const q = g.questions[0];
    expect(textErrors({ ...g, questions: [q] }, "rb-b1-01").length).toBeGreaterThan(0);
    expect(textErrors({ ...g, questions: [{ ...q, answer: 3 }, q] }, "rb-b1-01").length).toBeGreaterThan(0);
    expect(textErrors({ ...g, questions: [{ ...q, options: ["a", "a", "b"] }, q] }, "rb-b1-01").length).toBeGreaterThan(0);
    expect(textErrors({ ...g, questions: [{ ...q, options: ["a", "b"] }, q] }, "rb-b1-01").length).toBeGreaterThan(0);
  });
  it("глосарій: форма є в тексті, унікальні форми, кирилиця, лема не порожня", () => {
    const g = good();
    const e = (glossary: ReadingText["glossary"]) => textErrors({ ...g, glossary }, "rb-b1-01");
    expect(e([])).not.toEqual([]);
    expect(e([{ lemma: "deploy", forms: ["deploy"], translation: "розгортати" }])).not.toEqual([]); // "deploy" нема в тексті
    expect(e([{ lemma: "a", forms: ["deployed"], translation: "х" }, { lemma: "b", forms: ["Deployed"], translation: "х" }])).not.toEqual([]);
    expect(e([{ lemma: "", forms: ["deployed"], translation: "розгортати" }])).not.toEqual([]);
    expect(e([{ lemma: "deploy", forms: ["deployed"], translation: "deploy" }])).not.toEqual([]);
    expect(e([{ lemma: "deploy", forms: ["deployed"], translation: "розгортати" }])).toEqual([]);
  });
});

describe("представлення для клієнта", () => {
  it("list: без тексту, питань і відповідей", () => {
    const [i] = listItems([mk()]);
    expect(Object.keys(i).sort()).toEqual(["id", "level", "title", "topic", "words"]);
    expect(i.words).toBe(wordCount(TEXT));
  });
  it("text: без answer і explanation", () => {
    const v = JSON.stringify(textView(mk()));
    expect(v).not.toContain("answer");
    expect(v).not.toContain("explanation");
    expect(v).not.toContain("бо b");
    expect(v).toContain("Q1?");
  });
  it("findText: лише з Map, небезпечний id → undefined", () => {
    const m = new Map([["rb-b1-01", mk()]]);
    expect(findText(m, "rb-b1-01")?.id).toBe("rb-b1-01");
    expect(findText(m, "../x")).toBeUndefined();
    expect(findText(m, "__proto__")).toBeUndefined();
    expect(findText(m, 5)).toBeUndefined();
  });
  it("lookup param: нормалізація, null або >40 → null", () => {
    expect(parseLookupWord("Deployed")).toBe("Deployed");
    expect(parseLookupWord("%")).toBeNull();
    expect(parseLookupWord(null)).toBeNull();
    expect(parseLookupWord("a".repeat(41))).toBeNull();
    expect(parseLookupWord("привіт")).toBeNull();
  });
});

describe("відповіді на питання", () => {
  const t = mk();
  it("повертає correct, правильні індекси й пояснення", () => {
    expect(gradeAnswers(t, [1, 1])).toEqual({
      correct: 1, total: 2,
      results: [{ correct: true, answer: 1, explanation: "бо b" }, { correct: false, answer: 0, explanation: "бо a" }],
    });
  });
  it("кривий формат → null", () => {
    expect(gradeAnswers(t, [1])).toBeNull();
    expect(gradeAnswers(t, [1, 5])).toBeNull();
    expect(gradeAnswers(t, [1, -1])).toBeNull();
    expect(gradeAnswers(t, [1, 0.5])).toBeNull();
    expect(gradeAnswers(t, "x" as never)).toBeNull();
    expect(parseAnswerBody({ id: "x", answers: [0] })).toEqual({ id: "x", answers: [0] });
    expect(parseAnswerBody({ id: 1, answers: [0] })).toBeNull();
    expect(parseAnswerBody({ id: "x", answers: "0" })).toBeNull();
    expect(parseAnswerBody(null)).toBeNull();
  });
});

describe("«+» у читанні: перевірка запиту", () => {
  const t = mk();
  const body = (o: object) => ({ textId: t.id, word: "deployed", sentence: "We deployed the fix.", ...o });
  it("parseCardBody", () => {
    expect(parseCardBody(body({}))).toEqual({ textId: t.id, word: "deployed", sentence: "We deployed the fix." });
    expect(parseCardBody({ textId: 1 })).toBeNull();
    expect(parseCardBody(null)).toBeNull();
  });
  it("невідомий textId → not_found", () => {
    expect(prepareCard(undefined, body({}), []).status).toBe("not_found");
  });
  it("речення не з тексту → invalid; пробіли нормалізуються", () => {
    expect(prepareCard(t, body({ sentence: "Not in the text." }), []).status).toBe("invalid");
    expect(prepareCard(t, body({ sentence: "We   deployed\nthe fix." }), []).status).toBe("ok");
  });
  it("слово не з глосарію і не з words → invalid; речення без натиснутої форми → invalid", () => {
    expect(prepareCard(t, body({ word: "fix" }), []).status).toBe("invalid");
    expect(prepareCard(t, body({ word: "deployed", sentence: "Then a roll-back wasn't needed!" }), []).status).toBe("invalid");
    expect(prepareCard(t, body({ word: "привіт" }), []).status).toBe("invalid");
  });
  it("глосарій: план за лемою", () => {
    expect(prepareCard(t, body({}), [])).toMatchObject({
      status: "ok",
      plan: { kind: "glossary", lemma: "deploy", form: "deployed", sentence: "We deployed the fix." },
    });
  });
  it("words: план з рядка за спільним правилом", () => {
    const r = prepareCard(t, body({ word: "fix" }), [row(8, "fix", "everyday"), row(3, "fix", "it")]);
    expect(r).toMatchObject({ status: "ok", plan: { kind: "words", row: { id: 3 }, form: "fix" } });
  });
  it("речення обрізається до 300", () => {
    const long = "word ".repeat(70) + "deployed " + "x ".repeat(5) + "end.";
    const lt = mk({ text: long });
    const r = prepareCard(lt, { textId: lt.id, word: "deployed", sentence: long.trim() }, []);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.plan.sentence.length).toBeLessThanOrEqual(300);
  });
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

describe("додавання картки з читання", () => {
  it("глосарій: картка за лемою, example = речення; повтор → exists без нових рядків", async () => {
    const { cards, store } = fakeStore();
    const t = mk();
    const p = prepareCard(t, { textId: t.id, word: "deployed", sentence: "We deployed the fix." }, []);
    if (p.status !== "ok") throw new Error("plan");
    expect((await runAddReadingCard(store, p.plan)).status).toBe("added");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ word: "deploy", example: "We deployed the fix.", wordId: null });
    expect((await runAddReadingCard(store, p.plan)).status).toBe("exists");
    expect(cards).toHaveLength(1);
  });
  it("інша форма тієї ж леми теж exists", async () => {
    const { cards, store } = fakeStore();
    const t = mk({
      text: "We deploy daily. We deployed the fix.",
      glossary: [{ lemma: "deploy", forms: ["deploy", "deployed"], translation: "розгортати" }],
    });
    const plan = (word: string, sentence: string) => {
      const p = prepareCard(t, { textId: t.id, word, sentence }, []);
      if (p.status !== "ok") throw new Error("plan");
      return p.plan;
    };
    await runAddReadingCard(store, plan("deployed", "We deployed the fix."));
    expect((await runAddReadingCard(store, plan("deploy", "We deploy daily."))).status).toBe("exists");
    expect(cards).toHaveLength(1);
  });
  it("words: картка з word_id і example = речення", async () => {
    const { cards, store } = fakeStore();
    const t = mk();
    const p = prepareCard(t, { textId: t.id, word: "fix", sentence: "We deployed the fix." }, [row(3, "fix", "it")]);
    if (p.status !== "ok") throw new Error("plan");
    expect((await runAddReadingCard(store, p.plan)).status).toBe("added");
    expect(cards[0]).toMatchObject({ wordId: 3, example: "We deployed the fix." });
    expect((await runAddReadingCard(store, p.plan)).status).toBe("exists");
    expect(cards).toHaveLength(1);
  });
});
