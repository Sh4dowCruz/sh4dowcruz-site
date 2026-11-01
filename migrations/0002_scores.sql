create table if not exists scores (
  id serial primary key,
  player_name text not null,
  score integer not null check (score >= 1 and score <= 222),
  created_at timestamptz not null default now()
);

create index if not exists scores_score_idx on scores (score desc);
