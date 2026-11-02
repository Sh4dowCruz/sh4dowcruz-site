import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";
import { bestScores, checkIn, cleanDay, PlayerError, signInPlayer, type Player } from "@/lib/players.server";

/* Plain JSON endpoints behind the public page (src/routes/index.tsx + public/site/site.js).
   The admin page keeps using the auth-protected server functions in scores.functions.ts. */

const MAX_SCORE = { snake: 222, dino: 99999 } as const;
type Game = keyof typeof MAX_SCORE;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function cleanGame(value: unknown): Game {
  return value === "snake" ? "snake" : "dino";
}

function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
}

/* ---------- leaderboard ---------- */

export async function boardResponse(request: Request): Promise<Response> {
  const game = cleanGame(new URL(request.url).searchParams.get("game"));
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
    limit 50
  `;
  return json({
    game,
    rows: rows.map((row) => ({ id: nameKey(row.player_name), name: row.player_name, score: Number(row.score) })),
  });
}

function playerErrorResponse(err: unknown): Response {
  if (err instanceof PlayerError) return json({ error: err.message, code: err.code }, err.status);
  throw err;
}

/* Sign in (or claim) a name with its PIN. Optionally counts today toward the streak (Study does this). */
export async function playerResponse(request: Request): Promise<Response> {
  let body: { name?: unknown; pin?: unknown; day?: unknown; checkin?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const sql = await getSql();
  try {
    const { player, claimed } = await signInPlayer(sql, body.name, body.pin);
    const streak = body.checkin === true ? await checkIn(sql, player, cleanDay(body.day)) : player.streak;
    return json({ name: player.name, claimed, streak, best: await bestScores(sql, player.name) });
  } catch (err) {
    return playerErrorResponse(err);
  }
}

export async function scoreResponse(request: Request): Promise<Response> {
  let body: { name?: unknown; pin?: unknown; score?: unknown; game?: unknown; day?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const game = cleanGame(body.game);
  const score = Number(body.score);
  if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE[game]) {
    return json({ error: "That score cannot be saved." }, 400);
  }
  const sql = await getSql();
  let player: Player;
  try {
    ({ player } = await signInPlayer(sql, body.name, body.pin));
  } catch (err) {
    return playerErrorResponse(err);
  }
  const name = player.name;
  const recent = await sql<{ at: string; best: number | null }>`
    select max(created_at)::text as at, max(score) as best
    from scores
    where game = ${game} and lower(player_name) = lower(${name})
  `;
  const last = recent[0]?.at ? Date.parse(recent[0].at) : 0;
  if (last && Date.now() - last < 8000) return json({ error: "Wait a moment before saving again." }, 429);
  const streak = await checkIn(sql, player, cleanDay(body.day));
  const best = Number(recent[0]?.best ?? 0);
  if (best >= score) return json({ status: "kept", best, streak });
  await sql`insert into scores (player_name, score, game) values (${name}, ${score}, ${game})`;
  return json({ status: "saved", best: score, streak });
}

export async function musicResponse(): Promise<Response> {
  const sql = await getSql();
  const rows = await sql<{ value: string }>`select value from site_setting where key = 'music'`;
  return json({ url: rows[0]?.value ?? "" });
}

/* ---------- study: Claude writes quizzes and flashcards ---------- */

const MAX_TEXT = 40_000;
const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 700_000; // base64 data URL, about 500 KB
const PER_VISITOR_PER_HOUR = Number(process.env.STUDY_HOURLY_LIMIT || 12);
const SITE_PER_DAY = Number(process.env.STUDY_DAILY_LIMIT || 400);

function visitorId(request: Request): string {
  const ip =
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return createHash("sha256").update(`cruz-study:${ip}`).digest("hex").slice(0, 32);
}

type StudyBody = { mode?: unknown; count?: unknown; text?: unknown; images?: unknown };

export async function studyResponse(request: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: "Study isn't switched on yet." }, 503);

  let body: StudyBody;
  try {
    body = (await request.json()) as StudyBody;
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const mode = body.mode === "cards" ? "cards" : "quiz";
  const allowed = mode === "cards" ? [8, 12, 20] : [5, 10, 15];
  const count = allowed.includes(Number(body.count)) ? Number(body.count) : allowed[0]!;
  const text = String(body.text ?? "").trim().slice(0, MAX_TEXT);
  const images = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];
  for (const image of images) {
    if (typeof image !== "string" || !/^data:image\/jpeg;base64,/.test(image) || image.length > MAX_IMAGE_CHARS) {
      return json({ error: "One of the pictures was too large to read." }, 400);
    }
  }
  if (text.length < 20 && images.length === 0) return json({ error: "Add notes, a PDF or photos first." }, 400);

  const sql = await getSql();
  const who = visitorId(request);
  const usage = await sql<{ mine: number; total: number }>`
    select
      count(*) filter (where who = ${who} and created_at > now() - interval '1 hour')::int as mine,
      count(*) filter (where created_at > now() - interval '1 day')::int as total
    from study_calls
    where created_at > now() - interval '1 day'
  `;
  if ((usage[0]?.mine ?? 0) >= PER_VISITOR_PER_HOUR) {
    return json({ error: "That's a lot of studying for one hour. Try again a bit later." }, 429);
  }
  if ((usage[0]?.total ?? 0) >= SITE_PER_DAY) {
    return json({ error: "Study has hit today's limit. Try again tomorrow." }, 429);
  }
  await sql`insert into study_calls (who) values (${who})`;
  await sql`delete from study_calls where created_at < now() - interval '2 days'`;

  const focus = shuffle(["definitions", "cause and effect", "comparisons", "small details", "applying a concept", "which item doesn't belong", "sequence or process"]).slice(0, 2).join(" and ");
  const instructions =
    mode === "cards"
      ? [
          `Make ${count} study flashcards from the study material, and only from it. Do not add facts that are not in the material.`,
          "Front: a short question or term (under 15 words). Back: a clear answer in one or two sentences.",
          "Cover the most important ideas and avoid near-duplicate cards.",
          'Reply with only JSON, no other text: {"cards":[{"front":"...","back":"..."}]}',
        ]
      : [
          `Write a fresh ${count}-question multiple-choice quiz from the study material, and only from it. Do not invent facts.`,
          "Don't follow the order of the notes. Skip a few obvious facts and test others.",
          `This round should lean on ${focus}.`,
          "Each question has exactly 4 short options with one correct answer (index 0-3). Wrong options should be plausible.",
          "Add a one-sentence explanation of why the correct answer is right, grounded in the material.",
          'Reply with only JSON, no other text: {"questions":[{"prompt":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}]}',
        ];

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } }
  > = images.map((image) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: "image/jpeg" as const, data: String(image).replace(/^data:image\/jpeg;base64,/, "") },
  }));
  content.push({
    type: "text",
    text: [...instructions, "", "<study_material>", text || "(No text. Use the attached images.)", "</study_material>"].join("\n"),
  });

  let raw = "";
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: mode === "cards" ? 3000 : 4000,
        messages: [{ role: "user", content }],
      }),
    });
    if (!response.ok) {
      console.error("[study] Claude API error", response.status, await response.text().catch(() => ""));
      return json({ error: "Claude couldn't be reached. Try again." }, 502);
    }
    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    raw = (data.content ?? []).filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
  } catch (err) {
    console.error("[study] request failed", err);
    return json({ error: "Claude couldn't be reached. Try again." }, 502);
  }

  const parsed = readJson(raw);
  if (mode === "cards") {
    const cards = (Array.isArray(parsed?.cards) ? parsed.cards : [])
      .map((card: { front?: unknown; back?: unknown }) => ({ front: String(card?.front ?? "").trim(), back: String(card?.back ?? "").trim() }))
      .filter((card: { front: string; back: string }) => card.front && card.back);
    if (cards.length < 3) return json({ error: "That material didn't give enough to work with. Add more notes." }, 422);
    return json({ cards });
  }
  const questions = cleanQuiz(parsed);
  if (questions.length < Math.min(3, count)) return json({ error: "That material didn't give enough to work with. Add more notes." }, 422);
  return json({ questions: questions.slice(0, count) });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readJson(raw: string): any {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

type Question = { prompt: string; options: string[]; answer: number; explanation: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cleanQuiz(parsed: any): Question[] {
  const out: Question[] = [];
  for (const q of Array.isArray(parsed?.questions) ? parsed.questions : []) {
    const prompt = String(q?.prompt ?? "").trim();
    const options = Array.isArray(q?.options) ? q.options.map((o: unknown) => String(o ?? "").trim()) : [];
    const answer = Number(q?.answer);
    if (!prompt || options.length !== 4 || options.some((o: string) => !o) || !Number.isInteger(answer) || answer < 0 || answer > 3) continue;
    const order = shuffle([0, 1, 2, 3]);
    out.push({
      prompt,
      options: order.map((i) => options[i] as string),
      answer: order.indexOf(answer),
      explanation: String(q?.explanation ?? "").trim(),
    });
  }
  return shuffle(out);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}
