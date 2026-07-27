import { Printer } from "lucide-react";
import { lazy, Suspense } from "react";
import DailyLogSheet from "./DailyLogSheet";
import RouteDirections from "./RouteDirections";
import SummaryCards from "./SummaryCards";

// Leaflet is the single heaviest dependency in the bundle and isn't needed
// until a trip actually exists — split it into its own chunk so the form
// (what every visitor sees first, often on mobile) loads and becomes
// interactive without waiting on map code to parse.
const MapView = lazy(() => import("./MapView"));

function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-2xl border border-ink-200 bg-ink-100">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink-300 border-t-ink-600" />
    </div>
  );
}

// Everything here reads from `result`/`vehicleInfo` inside THIS component's
// own render, rather than as inline JSX prop expressions in App.jsx's
// render. That matters: React error boundaries only catch errors thrown by
// their descendants, never by their own parent's render — so if a stored
// trip has an unexpected/missing shape, the crash needs to happen in here
// (a child of the boundary App wraps this in) to actually be caught.
export default function TripResults({ result, vehicleInfo }) {
  return (
    <>
      <div className="print-hide space-y-6">
        <SummaryCards summary={result.summary} route={result.route} />
        <div className="h-[280px] sm:h-[420px]">
          <Suspense fallback={<MapSkeleton />}>
            <MapView waypoints={result.waypoints} geometry={result.route.geometry} stops={result.stops} />
          </Suspense>
        </div>
        <RouteDirections legs={result.route.legs} />
      </div>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink-900">
            Daily log sheets ({result.daily_logs.length})
          </h2>
          <button
            type="button"
            onClick={() => window.print()}
            className="print-hide flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 shadow-sm transition hover:bg-ink-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Print / Save as PDF
          </button>
        </div>
        {result.daily_logs.map((log) => (
          <div key={log.date} className="print-area">
            <DailyLogSheet log={log} vehicleInfo={vehicleInfo} />
          </div>
        ))}
      </div>
    </>
  );
}
