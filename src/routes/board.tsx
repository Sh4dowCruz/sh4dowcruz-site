import { createFileRoute, redirect } from "@tanstack/react-router";

// The leaderboard now lives on the home page at /#board.
export const Route = createFileRoute("/board")({
  beforeLoad: () => {
    throw redirect({ to: "/", hash: "board" });
  },
});
