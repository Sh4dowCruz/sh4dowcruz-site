import { createFileRoute, redirect } from "@tanstack/react-router";

// The quiz now lives on the home page at /#study.
export const Route = createFileRoute("/study_/quiz")({
  beforeLoad: () => {
    throw redirect({ to: "/", hash: "study" });
  },
});
