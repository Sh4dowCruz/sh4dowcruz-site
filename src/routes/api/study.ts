import { createFileRoute } from "@tanstack/react-router";
import { studyResponse } from "@/lib/site-api.server";

export const Route = createFileRoute("/api/study")({
  server: {
    handlers: {
      POST: ({ request }) => studyResponse(request),
    },
  },
});
