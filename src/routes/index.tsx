import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { SITE_MARKUP } from "@/site/markup";

export const Route = createFileRoute("/")({
  head: () => ({
    links: [{ rel: "stylesheet", href: "/site/site.css" }],
  }),
  component: Home,
});

declare global {
  interface Window {
    __cruzSite?: boolean;
  }
}

function Home() {
  useEffect(() => {
    // The page script binds to this markup once. Coming back from /admin inside the
    // app would leave it pointing at old nodes, so start fresh instead.
    if (window.__cruzSite) {
      window.location.reload();
      return;
    }
    const script = document.createElement("script");
    script.src = "/site/site.js";
    document.body.appendChild(script);
  }, []);

  return <div id="cruz-site" dangerouslySetInnerHTML={{ __html: SITE_MARKUP }} />;
}
