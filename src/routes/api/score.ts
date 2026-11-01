import { createFileRoute } from "@tanstack/react-router";
import { scoreResponse } from "@/lib/site-api.server";

export const Route = createFileRoute("/api/score")({
  server: {
    handlers: {
      POST: ({ request }) => scoreResponse(request),
    },
  },
});
