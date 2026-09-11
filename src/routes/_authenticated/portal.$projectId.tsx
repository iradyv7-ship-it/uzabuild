import { createFileRoute } from "@tanstack/react-router";
import { PortalProjectPage } from "@/pages/Portal";

export const Route = createFileRoute("/_authenticated/portal/$projectId")({
  head: () => ({
    meta: [
      { title: "Your project — UZA Build client portal" },
      {
        name: "description",
        content:
          "Your project stage, the sign-offs recorded against it and the proformas UZA has issued to you.",
      },
      { property: "og:title", content: "Your project — UZA Build client portal" },
      {
        property: "og:description",
        content: "Stage progress, recorded sign-offs and issued proformas for your project.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PortalProjectRoute,
});

function PortalProjectRoute() {
  const { projectId } = Route.useParams();
  return <PortalProjectPage projectId={projectId} />;
}
