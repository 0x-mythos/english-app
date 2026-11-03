// Читання: текст B1 або B2 (за рівнем граматики), 3 питання. ≥2/3 → рівень тексту, інакше на рівень нижче.

import type { GrammarLevel } from "./grammar";

export type ReadingLevel = "A2" | "B1" | "B2";

type ReadingText = {
  level: "B1" | "B2";
  title: string;
  text: string;
  questions: { prompt: string; options: string[]; answer: number }[];
};

export const READING_TEXTS: Record<"B1" | "B2", ReadingText> = {
  B1: {
    level: "B1",
    title: "A new developer's first week",
    text:
      "Marta joined a small startup as a junior backend developer. On her first day, her team lead gave her access to the code and asked her to fix a small bug in the login page. " +
      "It took her almost two days, because she had to understand how the project was organised. On Thursday she presented her fix at the team meeting. " +
      "Her colleagues asked a lot of questions, which made her nervous at first, but later she realised they simply wanted to help. " +
      "By Friday she felt much more confident and even suggested a way to make the tests run faster.",
    questions: [
      { prompt: "Why did the bug take Marta almost two days?", options: ["The bug was very serious", "She had to learn how the project worked", "Her team lead was away", "She didn't have access to the code"], answer: 1 },
      { prompt: "How did Marta feel about her colleagues' questions in the end?", options: ["She thought they wanted to help", "She thought they didn't trust her", "She was still nervous", "She found them boring"], answer: 0 },
      { prompt: "What did Marta do on Friday?", options: ["She fixed another bug", "She left the company", "She suggested speeding up the tests", "She presented at the team meeting"], answer: 2 },
    ],
  },
  B2: {
    level: "B2",
    title: "Why teams write post-mortems",
    text:
      "When a production system fails, the natural reaction is to look for someone to blame. Many engineering teams, however, have adopted the practice of writing blameless post-mortems. " +
      "The idea is that serious outages are rarely caused by a single careless person; they usually result from a chain of small weaknesses in tools, processes and communication. " +
      "If engineers fear punishment, they tend to hide details, and the organisation loses the information it needs to prevent the next incident. " +
      "A good post-mortem therefore describes what happened, why existing safeguards did not catch the problem, and which concrete changes will be made — without naming a guilty individual.",
    questions: [
      { prompt: "According to the text, what usually causes serious outages?", options: ["One careless engineer", "A combination of small weaknesses", "Old hardware", "A lack of post-mortems"], answer: 1 },
      { prompt: "What happens when engineers fear punishment?", options: ["They work more carefully", "They write longer reports", "They hide important details", "They leave the company"], answer: 2 },
      { prompt: "Which of these does a good post-mortem NOT include?", options: ["What happened", "Why safeguards failed", "Planned changes", "The name of the person responsible"], answer: 3 },
    ],
  },
};

/** Рівень граматики → текст: до B1 включно — B1, вище — B2. */
export function readingTextFor(grammar: GrammarLevel): ReadingText {
  return grammar === "B2" || grammar === "C1" ? READING_TEXTS.B2 : READING_TEXTS.B1;
}

export function publicReading(t: ReadingText) {
  return { level: t.level, title: t.title, text: t.text, questions: t.questions.map(({ prompt, options }) => ({ prompt, options })) };
}

export function scoreReading(textLevel: "B1" | "B2", answers: number[]): { level: ReadingLevel; correct: number } {
  const t = READING_TEXTS[textLevel];
  const correct = t.questions.filter((qq, i) => answers[i] === qq.answer).length;
  const level: ReadingLevel = correct >= 2 ? textLevel : textLevel === "B2" ? "B1" : "A2";
  return { level, correct };
}
