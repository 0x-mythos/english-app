-- Етап 3 (решта): власні слова юзера мають свою транскрипцію (у слів з набору вона в words)
alter table cards add column transcription text;

-- швидкий пошук «чи вже є таке власне слово» без урахування регістру
create index cards_user_own_word on cards (user_id, lower(word)) where word is not null;
