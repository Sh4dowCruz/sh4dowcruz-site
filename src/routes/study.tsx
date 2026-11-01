import { createFileRoute, redirect } from "@tanstack/react-router";

// Study now lives on the home page at /#study.
export const Route = createFileRoute("/study")({
  beforeLoad: () => {
    throw redirect({ to: "/", hash: "study" });
  },
});
