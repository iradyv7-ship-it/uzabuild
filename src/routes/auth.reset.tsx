import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/pages/Auth";

export const Route = createFileRoute("/auth/reset")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set your password — UZA Build" },
      {
        name: "description",
        content: "Choose a new password for your UZA Build workspace seat.",
      },
      { property: "og:title", content: "Set your password — UZA Build" },
      {
        property: "og:description",
        content: "Choose a new password for your UZA Build workspace seat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});
