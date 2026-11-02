-- When a player last changed their own name (self-renames are limited to once a week).
alter table players add column if not exists renamed_at timestamptz;
