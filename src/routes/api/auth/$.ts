import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => guard(request),
      POST: ({ request }) => guard(request),
    },
  },
});

async function guard(request: Request) {
  const next = await sameSiteRequest(request);
  const path = new URL(next.url).pathname;
  if (path.includes("oauth")) {
    return Response.json({ message: "This board does not use X or Grok sign-in." }, { status: 403 });
  }
  if (next.method === "POST" && path.endsWith("/sign-up/email")) {
    const sql = await getSql();
    const rows = await sql<{ n: number }>`select count(*)::int as n from "user"`;
    if ((rows[0]?.n ?? 0) > 0) {
      return Response.json({ message: "The admin account already exists." }, { status: 403 });
    }
  }
  return auth.handler(next);
}

async function sameSiteRequest(request: Request): Promise<Request> {
  const origin = request.headers.get("origin");
  if (!origin) return request;
  const site = request.headers.get("sec-fetch-site");
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    return request;
  }
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || request.headers.get("host") || "";
  const browserSameOrigin = site === "same-origin" || site === "none";
  if (!browserSameOrigin && originHost !== host) return request;
  const listed = (process.env.BETTER_AUTH_URL || "http://localhost:8080").replace(/\/+$/, "");
  const trusted = new URL(listed).origin;
  if (origin.replace(/\/+$/, "") === trusted) return request;
  const headers = new Headers(request.headers);
  headers.set("origin", trusted);
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
  return new Request(request.url, { method: request.method, headers, body });
}