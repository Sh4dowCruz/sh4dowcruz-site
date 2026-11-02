-- One row per claimed name. The PIN is never stored, only a salted scrypt hash.
-- A null pin_hash means the name is free to (re)claim, e.g. after the admin resets it.
create table if not exists players (
  name_key text primary key,
  name text not null,
  pin_hash text,
  pin_salt text,
  streak_count integer not null default 0,
  streak_last text,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
