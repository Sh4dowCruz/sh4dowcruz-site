import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

const NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,15}$/;
const GAMES = ["snake", "dino"] as const;

export type GameId = (typeof GAMES)[number];
export type BoardRow = { name: string; score: number };
export type ScoreRow = { id: number; name: string; score: number; game: GameId; at: string };

const MAX_SCORE: Record<GameId, number> = { snake: 222, dino: 99999 };

export function cleanGame(value: unknown): GameId {
  return value === "dino" ? "dino" : "snake";
}

function cleanName(value: unknown): string {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!NAME.test(name)) throw new Error("Use 1–16 letters or numbers.");
  return name;
}

function cleanScore(value: unknown, game: GameId): number {
  const score = Number(value);
  const max = MAX_SCORE[game];
  if (!Number.isInteger(score) || score < 1 || score > max) {
    throw new Error("That score cannot be saved.");
  }
  return score;
}

export const listBoard = createServerFn({ method: "GET" })
  .validator((input?: { game?: string }) => input ?? {})
  .handler(async ({ data }) => {
    const game = cleanGame(data?.game);
    const sql = await getSql();
    const rows = await sql<{ player_name: string; score: number }>`
      select player_name, score
      from (
        select distinct on (lower(player_name)) player_name, score, created_at
        from scores
        where game = ${game}
        order by lower(player_name), score desc, created_at asc
      ) board
      order by score desc, created_at asc
      limit 10
    `;
    return rows.map((row) => ({ name: row.player_name, score: row.score }));
  });

export const submitScore = createServerFn({ method: "POST" })
  .validator((input: { name: string; score: number; game?: string }) => input)
  .handler(async ({ data }) => {
    const game = cleanGame(data.game);
    const name = cleanName(data.name);
    const score = cleanScore(data.score, game);
    const sql = await getSql();
    const recent = await sql<{ at: string }>`
      select created_at::text as at
      from scores
      where game = ${game} and lower(player_name) = lower(${name})
      order by created_at desc
      limit 1
    `;
    const last = recent[0]?.at ? Date.parse(recent[0].at) : 0;
    if (last && Date.now() - last < 8000) throw new Error("Wait a moment before saving again.");
    await sql`insert into scores (player_name, score, game) values (${name}, ${score}, ${game})`;
    return { ok: true as const };
  });

export const adminOpen = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<{ n: number }>`select count(*)::int as n from "user"`;
  return { open: (rows[0]?.n ?? 0) === 0 };
});

export const listScores = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const sql = await getSql();
    const rows = await sql<{ id: number; player_name: string; score: number; game: string; at: string }>`
      select id, player_name, score, game, created_at::text as at
      from scores
      order by created_at desc
      limit 100
    `;
    return rows.map((row) => ({
      id: row.id,
      name: row.player_name,
      score: row.score,
      game: cleanGame(row.game),
      at: row.at,
    }));
  });

export const deleteScore = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number }) => input)
  .handler(async ({ data }) => {
    const id = Number(data.id);
    if (!Number.isInteger(id) || id < 1) throw new Error("Missing score.");
    const sql = await getSql();
    await sql`delete from scores where id = ${id}`;
    return { ok: true as const };
  });

export const clearScores = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    const sql = await getSql();
    await sql`delete from scores`;
    return { ok: true as const };
  });

export const getMusic = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<{ value: string }>`
    select value from site_setting where key = 'music'
  `;
  const url = rows[0]?.value ?? "";
  const parts = youtubeParts(url);
  return { url, videoId: parts?.video ?? "", listId: parts?.playlist ?? "" };
});

export const setMusic = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { url: string }) => input)
  .handler(async ({ data }) => {
    const url = String(data.url ?? "").trim();
    if (url && !youtubeParts(url)) throw new Error("Paste a YouTube or YouTube Music link.");
    const sql = await getSql();
    if (!url) {
      await sql`delete from site_setting where key = 'music'`;
      return { ok: true as const };
    }
    await sql`
      insert into site_setting (key, value) values ('music', ${url})
      on conflict (key) do update set value = excluded.value
    `;
    return { ok: true as const };
  });

function youtubeParts(raw: string): { video: string; playlist: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");
  if (!["music.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"].includes(host)) return null;
  const list = url.searchParams.get("list") ?? "";
  let id = "";
  if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] ?? "";
  else if (url.pathname.startsWith("/embed/") || url.pathname.startsWith("/shorts/")) {
    id = url.pathname.split("/")[2] ?? "";
  } else id = url.searchParams.get("v") ?? "";
  const video = /^[\w-]{6,}$/.test(id) ? id : "";
  const playlist = /^[\w-]+$/.test(list) ? list : "";
  if (!video && !playlist) return null;
  return { video, playlist };
}

export type PlayerRow = { key: string; name: string; claimed: boolean; streak: number; last: string | null };

export const listPlayers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const sql = await getSql();
    const rows = await sql<{ name_key: string; name: string; claimed: boolean; streak_count: number; streak_last: string | null }>`
      select name_key, name, pin_hash is not null as claimed, streak_count, streak_last
      from players
      order by updated_at desc
      limit 200
    `;
    return rows.map((row) => ({
      key: row.name_key,
      name: row.name,
      claimed: Boolean(row.claimed),
      streak: Number(row.streak_count) || 0,
      last: row.streak_last,
    }));
  });

/** Clear a player's PIN so the next person to play under that name sets a new one. The streak is kept. */
export const resetPlayerPin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { key: string }) => input)
  .handler(async ({ data }) => {
    const key = String(data.key ?? "").trim().toLowerCase();
    if (!key) throw new Error("Missing player.");
    const sql = await getSql();
    await sql`update players set pin_hash = null, pin_salt = null, failed_attempts = 0, locked_until = null, updated_at = now() where name_key = ${key}`;
    return { ok: true as const };
  });
