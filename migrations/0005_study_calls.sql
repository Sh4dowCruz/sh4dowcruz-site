create table if not exists study_calls (
  id serial primary key,
  who text not null,
  created_at timestamptz not null default now()
);

create index if not exists study_calls_who_idx on study_calls (who, created_at desc);
create index if not exists study_calls_at_idx on study_calls (created_at desc);
