import { createFileRoute } from "@tanstack/react-router";
import { boardResponse } from "@/lib/site-api.server";

export const Route = createFileRoute("/api/board")({
  server: {
    handlers: {
      GET: ({ request }) => boardResponse(request),
    },
  },
});
