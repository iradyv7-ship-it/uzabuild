import { createFileRoute } from "@tanstack/react-router";
import { PortalDashboard } from "@/pages/Portal";

export const Route = createFileRoute("/_authenticated/portal/")({
  head: () => ({
    meta: [
      { title: "Client dashboard — UZA Build" },
      {
        name: "description",
        content:
          "Follow your UZA Finishing Solutions projects: current stage, recorded sign-offs, issued proformas and the exchange rate they were priced at.",
      },
      { property: "og:title", content: "Client dashboard — UZA Build" },
      {
        property: "og:description",
        content: "Your projects, sign-offs, issued proformas and the USD/RMB rate in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PortalDashboardRoute,
});

function PortalDashboardRoute() {
  return <PortalDashboard />;
}
