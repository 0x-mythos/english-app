# Банк граматичних вправ — формат

Один файл на тему: `data/grammar/<topic>.json`. Генерується субагентами (не через API), перевіряється тестом `src/lib/grammar/bank.test.ts`.

```json
{
  "topic": "present_perfect",
  "title": "Present Perfect",
  "rule": "Коротке правило українською, 2–4 речення, з 1–2 прикладами англійською.",
  "items": [
    { "id": "present_perfect-01", "level": "B1", "type": "choice",
      "prompt": "I ___ here since 2020.", "options": ["have worked", "work", "am working", "worked"], "answer": 0,
      "explanation": "Since + момент у минулому → Present Perfect." },
    { "id": "present_perfect-02", "level": "B1", "type": "gap",
      "prompt": "She ___ (not / finish) the report yet.", "answers": ["hasn't finished", "has not finished"],
      "explanation": "..." },
    { "id": "present_perfect-03", "level": "B1", "type": "fix",
      "prompt": "I have seen him yesterday.", "answers": ["I saw him yesterday."],
      "explanation": "..." }
  ]
}
```

Правила:
- `id` = `<topic>-NN`, унікальні; `level` ∈ A2|B1|B2|C1.
- `choice`: рівно 1 пропуск `___`, 3–4 різні варіанти, `answer` — індекс правильного, решта однозначно неправильні.
- `gap`: рівно 1 пропуск `___`, підказка в дужках після пропуску (базова форма), `answers` — усі прийнятні варіанти (повна й скорочена форма).
- `fix`: речення з ОДНІЄЮ типовою помилкою саме цієї теми (як у реальних помилках українців), `answers` — виправлене речення(-ння) повністю з розділовим знаком.
- `explanation` — українською, 1 речення, чому саме так.
- Контекст: половина — робота в IT (код, стендап, рев'ю, співбесіда, деплой), половина — побут. Природна сучасна англійська.
