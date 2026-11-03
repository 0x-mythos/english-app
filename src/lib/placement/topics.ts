// Назви граматичних тем для UI. Невідомі теми (від Claude) показуємо як є, без підкреслень.
const LABELS: Record<string, string> = {
  past_simple: "Past Simple",
  present_simple: "Present Simple",
  present_continuous: "Present Continuous",
  present_perfect: "Present Perfect",
  future_forms: "Майбутній час",
  comparatives: "Ступені порівняння",
  prepositions: "Прийменники",
  articles: "Артиклі",
  conditionals: "Умовні речення",
  passive: "Пасивний стан",
  modals: "Модальні дієслова",
  gerund_infinitive: "Герундій / інфінітив",
  reported_speech: "Непряма мова",
  relative_clauses: "Підрядні означальні",
  wish: "I wish",
  inversion: "Інверсія",
  subjunctive: "Subjunctive",
  cleft_sentences: "Cleft sentences",
  word_order: "Порядок слів",
  vocabulary: "Лексика",
  spelling: "Правопис",
};

export function topicLabel(topic: string) {
  return LABELS[topic] ?? topic.replace(/_/g, " ");
}
