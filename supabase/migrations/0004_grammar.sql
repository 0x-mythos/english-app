-- Етап 5: граматичні дрили. Банк вправ живе в data/grammar/*.json (у коді), тут лише відповіді юзера.
-- item_id: id вправи з банку ('articles-07') або 'm<id>' — виправлення власної помилки з mistakes.
create table grammar_attempts (
  id          bigserial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  item_id     text not null,
  topic       text not null,
  correct     boolean not null,
  answer      text,
  created_at  timestamptz not null default now()
);

create index grammar_attempts_user_time on grammar_attempts (user_id, created_at desc);

alter table grammar_attempts enable row level security;
grant select, insert, update, delete on grammar_attempts to service_role;
grant usage, select on sequence grammar_attempts_id_seq to service_role;
