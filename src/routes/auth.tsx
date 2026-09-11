import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/pages/Auth";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — UZA Build" },
      { name: "description", content: "Sign in to the UZA Build takeoff and costing workspace." },
      { property: "og:title", content: "Sign in — UZA Build" },
      {
        property: "og:description",
        content: "Sign in to the UZA Build takeoff and costing workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});
