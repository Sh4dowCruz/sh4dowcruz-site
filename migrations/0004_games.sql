alter table scores add column if not exists game text not null default 'snake';

do $$
declare cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'scores'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%222%';
  if cname is not null then
    execute format('alter table scores drop constraint %I', cname);
  end if;
end $$;

alter table scores drop constraint if exists scores_score_range;
alter table scores add constraint scores_score_range check (score >= 1 and score <= 999999);

alter table scores drop constraint if exists scores_game_kind;
alter table scores add constraint scores_game_kind check (game in ('snake', 'dino'));

create index if not exists scores_game_idx on scores (game, score desc);
