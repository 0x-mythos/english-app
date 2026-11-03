-- English App — початкова схема
-- Доступ до таблиць лише з сервера (service role); RLS увімкнено без політик = клієнт з anon-ключем нічого не бачить.

create table users (
  id            uuid primary key default gen_random_uuid(),
  telegram_id   bigint unique not null,
  first_name    text,
  username      text,
  goals         text[] not null default '{}',        -- 'it', 'everyday'
  minutes_per_day int not null default 10,
  topics        text[] not null default '{}',
  timezone      text not null default 'Europe/Warsaw',
  remind_at     time not null default '19:00',
  created_at    timestamptz not null default now()
);

create table skill_profile (
  user_id         uuid primary key references users(id) on delete cascade,
  vocab_size_est  int,                                -- оцінка розміру словника
  grammar_level   text,                               -- CEFR-орієнтир: A2..C1
  reading_level   text,
  writing_level   text,
  weak_topics     jsonb not null default '[]',        -- [{topic, score}]
  tested_at       timestamptz,
  updated_at      timestamptz not null default now()
);

create table words (
  id            bigserial primary key,
  word          text not null,
  translation   text not null,                        -- українською
  transcription text,
  example       text,                                 -- речення-приклад з цим словом
  set_name      text not null,                        -- 'it' | 'everyday'
  freq_rank     int,                                  -- частотний ранг (для everyday)
  cefr          text,
  unique (word, set_name)
);
create index words_set_rank on words (set_name, freq_rank);

create table cards (
  id             bigserial primary key,
  user_id        uuid not null references users(id) on delete cascade,
  word_id        bigint references words(id) on delete set null,
  -- власне слово (коли word_id null)
  word           text,
  translation    text,
  example        text,
  kind           text not null default 'recall',      -- 'recall' | 'cloze' | 'reverse'
  -- стан FSRS
  due            timestamptz not null default now(),
  stability      double precision not null default 0,
  difficulty     double precision not null default 0,
  elapsed_days   int not null default 0,
  scheduled_days int not null default 0,
  reps           int not null default 0,
  lapses         int not null default 0,
  state          smallint not null default 0,         -- 0 New, 1 Learning, 2 Review, 3 Relearning
  last_review    timestamptz,
  created_at     timestamptz not null default now(),
  check (word_id is not null or word is not null)
);
create index cards_user_due on cards (user_id, due);

create table review_logs (
  id          bigserial primary key,
  card_id     bigint not null references cards(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  rating      smallint not null,                      -- 1 Again, 2 Hard, 3 Good, 4 Easy
  state       smallint not null,
  due         timestamptz not null,
  stability   double precision not null,
  difficulty  double precision not null,
  elapsed_days int not null,
  scheduled_days int not null,
  reviewed_at timestamptz not null default now()
);
create index review_logs_user on review_logs (user_id, reviewed_at);

create table mistakes (
  id          bigserial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  kind        text not null,                          -- 'grammar' | 'vocab'
  topic       text not null,                          -- напр. 'present_perfect', 'articles'
  original    text not null,
  corrected   text not null,
  explanation text,
  source      text not null,                          -- 'chat' | 'drill' | 'test'
  count       int not null default 1,
  created_at  timestamptz not null default now()
);
create index mistakes_user_topic on mistakes (user_id, topic);

create table chat_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  scenario   text not null,                           -- 'interview', 'standup', 'free', ...
  created_at timestamptz not null default now()
);

create table chat_messages (
  id         bigserial primary key,
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role       text not null,                           -- 'user' | 'assistant'
  content    text not null,
  corrections jsonb,                                  -- [{original, corrected, explanation, topic}]
  created_at timestamptz not null default now()
);

create table streaks (
  user_id       uuid primary key references users(id) on delete cascade,
  current       int not null default 0,
  best          int not null default 0,
  freezes       int not null default 1,
  last_active   date
);

alter table users          enable row level security;
alter table skill_profile  enable row level security;
alter table words          enable row level security;
alter table cards          enable row level security;
alter table review_logs    enable row level security;
alter table mistakes       enable row level security;
alter table chat_sessions  enable row level security;
alter table chat_messages  enable row level security;
alter table streaks        enable row level security;

-- Проєкт створено без авто-експозиції таблиць → права лише сервісній ролі
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
