import { createFileRoute } from "@tanstack/react-router";
import { musicResponse } from "@/lib/site-api.server";

export const Route = createFileRoute("/api/music")({
  server: {
    handlers: {
      GET: () => musicResponse(),
    },
  },
});
