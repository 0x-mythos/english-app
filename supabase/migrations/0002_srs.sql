-- Етап 3: FSRS-сесії і нагадування

-- ts-fsrs 6 тримає крок (пере)навчання в картці
alter table cards       add column learning_steps int not null default 0;
alter table review_logs add column learning_steps int not null default 0;
alter table review_logs add column duration_ms int;           -- скільки думав над карткою (для аналізу)

-- одна картка на слово з набору (NULL-и різні, тож власні слова з word_id null не заважають);
-- саме constraint, а не частковий індекс — інакше upsert on conflict (user_id, word_id) не знайде його
alter table cards add constraint cards_user_word unique (user_id, word_id);

-- тема всередині набору (для IT: api, code_review, meetings…) — щоб перемішувати теми в сесії
alter table words add column topic text;

alter table users add column reminders_on boolean not null default true;
alter table users add column last_reminded_on date;          -- локальна дата юзера, щоб не слати двічі на день
