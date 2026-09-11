import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FX_MAX_AGE_HOURS } from "@/config/policy";
import { getUsdRmbRate } from "@/lib/fx.functions";

/**
 * The published USD→RMB rate UZA prices factory quotations at. Clients see the
 * rate and its source so a proforma total is traceable — never the RMB cost
 * lines behind it.
 */
export function PortalRateCard() {
  const fetchRate = useServerFn(getUsdRmbRate);
  const fx = useQuery({
    queryKey: ["fx-usd-rmb"],
    queryFn: () => fetchRate({}),
    staleTime: FX_MAX_AGE_HOURS * 60 * 60 * 1000,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          USD / RMB rate
          {fx.data && (
            <Badge variant={fx.data.live ? "default" : "outline"}>
              {fx.data.live ? "Published rate" : "Working rate"}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Factory quotations are converted to USD at this rate before a proforma is issued.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {fx.isLoading ? (
          <>
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-4 w-56" />
          </>
        ) : fx.error ? (
          <p className="text-sm text-destructive">The rate could not be loaded right now.</p>
        ) : fx.data ? (
          <>
            <p className="tabular font-display text-3xl font-semibold tracking-tight">
              1 USD = {fx.data.rate.toFixed(4)} RMB
            </p>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <RefreshCw className="size-3.5" aria-hidden />
              {fx.data.source} · as of {fx.data.asOf}
            </p>
            {fx.data.note && <p className="text-sm text-muted-foreground">{fx.data.note}</p>}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
