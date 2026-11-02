import { createFileRoute } from "@tanstack/react-router";
import { playerResponse } from "@/lib/site-api.server";

export const Route = createFileRoute("/api/player")({
  server: {
    handlers: {
      POST: ({ request }) => playerResponse(request),
    },
  },
});
