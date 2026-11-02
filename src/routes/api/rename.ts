import { createFileRoute } from "@tanstack/react-router";
import { renameResponse } from "@/lib/site-api.server";

export const Route = createFileRoute("/api/rename")({
  server: {
    handlers: {
      POST: ({ request }) => renameResponse(request),
    },
  },
});
