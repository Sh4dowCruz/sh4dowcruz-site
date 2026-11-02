import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Sql } from "@/lib/db";

/* Players claim a name with a 4–6 digit PIN. Streaks live here so they follow the
   name to any device. PINs are stored only as salted scrypt hashes. */

const scrypt = promisify(scryptCb) as (pin: string, salt: Buffer, len: number) => Promise<Buffer>;

export const NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,15}$/;
const PIN = /^\d{4,6}$/;
const MAX_FAILS = 5;
const LOCK_MINUTES = 10;

export type Streak = { count: number; last: string | null };
export type Player = { key: string; name: string; streak: Streak };

export class PlayerError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Row = {
  name_key: string;
  name: string;
  pin_hash: string | null;
  pin_salt: string | null;
  streak_count: number;
  streak_last: string | null;
  failed_attempts: number;
  locked: boolean;
  minutes_left: number | null;
};

export function cleanName(value: unknown): string {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!NAME.test(name)) throw new PlayerError("Use 1–16 letters or numbers.", 400, "bad_name");
  return name;
}

export function playerKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanPin(value: unknown): string {
  const pin = String(value ?? "").trim();
  if (!PIN.test(pin)) throw new PlayerError("Your PIN is 4 to 6 digits.", 400, "bad_pin");
  return pin;
}

async function hashPin(pin: string, salt: Buffer): Promise<string> {
  return (await scrypt(pin, salt, 32)).toString("hex");
}

function toPlayer(row: Pick<Row, "name_key" | "name" | "streak_count" | "streak_last">): Player {
  return { key: row.name_key, name: row.name, streak: { count: Number(row.streak_count) || 0, last: row.streak_last } };
}

async function readRow(sql: Sql, key: string): Promise<Row | null> {
  const rows = await sql<Row>`
    select name_key, name, pin_hash, pin_salt, streak_count, streak_last, failed_attempts,
           coalesce(locked_until > now(), false) as locked,
           case when locked_until > now() then ceil(extract(epoch from (locked_until - now())) / 60)::int end as minutes_left
    from players where name_key = ${key}
  `;
  return rows[0] ?? null;
}

/**
 * Sign a player in by name + PIN. An unclaimed name (never seen, or reset by the
 * admin) is claimed on the spot with this PIN. Throws PlayerError on a wrong PIN,
 * a lockout, or bad input.
 */
export async function signInPlayer(sql: Sql, rawName: unknown, rawPin: unknown): Promise<{ player: Player; claimed: boolean }> {
  const name = cleanName(rawName);
  const pin = cleanPin(rawPin);
  const key = playerKey(name);

  let row = await readRow(sql, key);
  if (!row || !row.pin_hash || !row.pin_salt) {
    const salt = randomBytes(16);
    const hash = await hashPin(pin, salt);
    // Claim only if still free; a racing claim by someone else wins and we fall through to verify.
    const claimed = await sql<Row>`
      insert into players (name_key, name, pin_hash, pin_salt)
      values (${key}, ${name}, ${hash}, ${salt.toString("hex")})
      on conflict (name_key) do update
        set name = excluded.name, pin_hash = excluded.pin_hash, pin_salt = excluded.pin_salt,
            failed_attempts = 0, locked_until = null, updated_at = now()
        where players.pin_hash is null
      returning name_key, name, streak_count, streak_last
    `;
    if (claimed[0]) return { player: toPlayer(claimed[0]), claimed: true };
    row = await readRow(sql, key);
    if (!row || !row.pin_hash || !row.pin_salt) throw new PlayerError("That name couldn't be claimed. Try again.", 409, "claim_failed");
  }

  if (row.locked) {
    const mins = Math.max(1, Number(row.minutes_left) || LOCK_MINUTES);
    throw new PlayerError(`Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`, 429, "locked");
  }

  const expected = Buffer.from(row.pin_hash, "hex");
  const actual = Buffer.from(await hashPin(pin, Buffer.from(row.pin_salt, "hex")), "hex");
  const ok = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!ok) {
    const fails = (Number(row.failed_attempts) || 0) + 1;
    if (fails >= MAX_FAILS) {
      await sql`update players set failed_attempts = 0, locked_until = now() + interval '10 minutes' where name_key = ${key}`;
      throw new PlayerError(`Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes.`, 429, "locked");
    }
    await sql`update players set failed_attempts = ${fails} where name_key = ${key}`;
    throw new PlayerError("That name is taken, and the PIN doesn't match.", 401, "wrong_pin");
  }
  if (row.failed_attempts) await sql`update players set failed_attempts = 0 where name_key = ${key}`;
  return { player: toPlayer(row), claimed: false };
}

/** The player's calendar day, trusted only within a day of the server's, else the server's UTC day. */
export function cleanDay(value: unknown): string {
  const today = new Date();
  const fallback = today.toISOString().slice(0, 10);
  const day = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fallback;
  const t = Date.parse(day + "T12:00:00Z");
  if (!Number.isFinite(t) || Math.abs(t - today.getTime()) > 36 * 3600 * 1000) return fallback;
  return day;
}

function dayBefore(day: string): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Count today toward the player's streak (once per day). */
export async function checkIn(sql: Sql, player: Player, day: string): Promise<Streak> {
  const { count, last } = player.streak;
  if (last === day) return player.streak;
  // A clock that went backwards (or a device in a far time zone) must not shrink the streak.
  if (last && last > day) return player.streak;
  const next = last === dayBefore(day) ? count + 1 : 1;
  await sql`update players set streak_count = ${next}, streak_last = ${day}, updated_at = now() where name_key = ${player.key}`;
  player.streak = { count: next, last: day };
  return player.streak;
}

export async function bestScores(sql: Sql, name: string): Promise<{ dino: number; snake: number }> {
  const rows = await sql<{ game: string; best: number }>`
    select game, max(score)::int as best from scores where lower(player_name) = ${playerKey(name)} group by game
  `;
  const out = { dino: 0, snake: 0 };
  for (const row of rows) if (row.game === "dino" || row.game === "snake") out[row.game] = Number(row.best) || 0;
  return out;
}

const RENAME_COOLDOWN_DAYS = 7;

/**
 * Move a player to a new name, carrying their PIN, streak and scores.
 * The new name must be completely free: no player owns it and no scores sit under it,
 * so a rename can never merge into someone else's history. A change of capitalization
 * only ("cruz" → "Cruz") is always allowed.
 */
export async function renamePlayer(
  sql: Sql,
  fromKey: string,
  rawNewName: unknown,
  opts: { cooldown: boolean },
): Promise<Player> {
  const newName = cleanName(rawNewName);
  const newKey = playerKey(newName);
  const rows = await sql<{ name: string; streak_count: number; streak_last: string | null; days_left: number | null }>`
    select name, streak_count, streak_last,
           case when renamed_at > now() - interval '7 days'
                then ceil(extract(epoch from (renamed_at + interval '7 days' - now())) / 86400)::int end as days_left
    from players where name_key = ${fromKey}
  `;
  const current = rows[0];
  if (!current) throw new PlayerError("That player doesn't exist.", 404, "no_player");
  if (current.name === newName) throw new PlayerError("That's already the name.", 400, "same_name");

  const sameKey = newKey === fromKey;
  if (opts.cooldown && !sameKey && current.days_left) {
    const d = Math.max(1, Number(current.days_left) || RENAME_COOLDOWN_DAYS);
    throw new PlayerError(`You can change your name again in ${d} day${d === 1 ? "" : "s"}.`, 429, "rename_cooldown");
  }
  if (!sameKey) {
    const taken = await sql<{ n: number }>`
      select (select count(*) from players where name_key = ${newKey})
           + (select count(*) from scores where lower(player_name) = ${newKey}) as n
    `;
    if (Number(taken[0]?.n) > 0) throw new PlayerError("That name is already taken.", 409, "name_taken");
  }

  // Player row first: the primary key rejects a racing rename into the same name.
  try {
    await sql`
      update players
      set name_key = ${newKey}, name = ${newName}, updated_at = now(),
          renamed_at = case when ${opts.cooldown} and ${!sameKey} then now() else renamed_at end
      where name_key = ${fromKey}
    `;
  } catch {
    throw new PlayerError("That name is already taken.", 409, "name_taken");
  }
  await sql`update scores set player_name = ${newName} where lower(player_name) = ${fromKey}`;
  return { key: newKey, name: newName, streak: { count: Number(current.streak_count) || 0, last: current.streak_last } };
}
