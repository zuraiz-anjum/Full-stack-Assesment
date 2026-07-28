import { AlertTriangle, Download, Loader2, Truck } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { extractErrorMessage, getSharedTrip, sharedTripPdfUrl } from "../lib/api";
import DailyLogSheet from "./DailyLogSheet";
import ErrorBoundary from "./ErrorBoundary";
import RouteDirections from "./RouteDirections";
import RouteMark from "./RouteMark";
import SummaryCards from "./SummaryCards";

const MapView = lazy(() => import("./MapView"));

function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-xl border border-ink-100 bg-ink-50">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink-200 border-t-ink-700" />
    </div>
  );
}

function crashFallback(_error, reset) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-red-200 bg-red-50 px-6 py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-red-500" />
      <h2 className="text-lg font-semibold text-red-800">Couldn't display this trip</h2>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800"
      >
        Try again
      </button>
    </div>
  );
}

function SharedTripContent({ trip }) {
  const result = trip.result;
  const vi = result?.vehicle_info;
  const vehicleInfo = vi && {
    carrierName: vi.carrier_name,
    mainOfficeAddress: vi.main_office_address,
    truckNumber: vi.truck_number,
    trailerNumber: vi.trailer_number,
    driverName: vi.driver_name,
    coDriverName: vi.co_driver_name,
    shippingDocNumber: vi.shipping_doc_number,
  };

  return (
    <div className="space-y-6">
      <SummaryCards summary={result.summary} route={result.route} />
      <div className="h-[280px] sm:h-[420px]">
        <Suspense fallback={<MapSkeleton />}>
          <MapView waypoints={result.waypoints} geometry={result.route.geometry} stops={result.stops} />
        </Suspense>
      </div>
      <RouteDirections legs={result.route.legs} />
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <h2 className="text-lg font-bold tracking-tight text-ink-950">
            Daily log sheets ({result.daily_logs.length})
          </h2>
          <a
            href={sharedTripPdfUrl(trip.share_token_used)}
            className="flex items-center gap-1.5 rounded-lg border border-ink-100 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:border-ink-200 hover:bg-ink-50"
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </a>
        </div>
        {result.daily_logs.map((log) => (
          <DailyLogSheet key={log.date} log={log} vehicleInfo={vehicleInfo} />
        ))}
      </div>
    </div>
  );
}

export default function SharedTripPage({ shareToken }) {
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSharedTrip(shareToken)
      .then((data) => {
        if (!cancelled) setTrip({ ...data, share_token_used: shareToken });
      })
      .catch((err) => {
        if (!cancelled) setError(extractErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  return (
    <div className="min-h-full bg-ink-50">
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-ink-950" strokeWidth={1.75} />
            <div>
              <p className="flex items-center gap-2 text-sm font-bold tracking-tight text-ink-950">
                RouteLog
                <RouteMark />
              </p>
              <p className="text-xs text-ink-500">Shared trip (read-only)</p>
            </div>
          </div>
          <a href="/" className="text-xs font-medium text-ink-500 hover:text-ink-800">
            Plan your own trip →
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {loading && (
          <div className="flex min-h-[300px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-ink-500" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-ink-200 bg-white px-6 py-16 text-center">
            <AlertTriangle className="h-8 w-8 text-ink-500" />
            <h2 className="text-lg font-semibold text-ink-800">Link not found</h2>
            <p className="max-w-sm text-sm text-ink-500">
              This share link doesn't point to a trip that exists — it may have been mistyped, or
              the trip may no longer be available.
            </p>
          </div>
        )}

        {!loading && trip && (
          <ErrorBoundary fallback={crashFallback}>
            <SharedTripContent trip={trip} />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}
