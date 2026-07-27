import { AlertTriangle, Truck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import TripForm from "./components/TripForm";
import TripHistorySidebar from "./components/TripHistorySidebar";
import TripResults from "./components/TripResults";
import { extractErrorMessage, getTrip, listTrips, planTrip } from "./lib/api";
import { addOwnTripId, getOwnTripIds } from "./lib/ownTrips";

function tripResultsFallback(reset) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-red-200 bg-red-50 px-6 py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-red-500" />
      <h2 className="text-lg font-semibold text-red-800">Couldn't display this trip</h2>
      <p className="max-w-sm text-sm text-red-600">
        Something about this trip's data didn't render correctly. Try planning a new trip, or
        picking a different one from your recent trips.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800"
      >
        Start over
      </button>
    </div>
  );
}

export default function App() {
  const [trip, setTrip] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const resultsRef = useRef(null);

  function scrollToResultsOnMobile() {
    // On the stacked mobile layout, results sit below the history list --
    // jump straight there instead of leaving the user to scroll past it.
    // The side-by-side desktop layout (lg+) already shows both at once.
    if (window.innerWidth < 1024) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  useEffect(() => {
    refreshHistory();
  }, []);

  async function refreshHistory() {
    try {
      setHistoryLoading(true);
      const trips = await listTrips();
      const ownIds = getOwnTripIds();
      setHistory(trips.filter((t) => ownIds.has(t.id)));
    } catch {
      // History is a nice-to-have; a failed fetch shouldn't block the app.
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleSubmit(formValues) {
    setSubmitting(true);
    setError("");
    try {
      const created = await planTrip(formValues);
      addOwnTripId(created.id);
      setTrip(created);
      refreshHistory();
      requestAnimationFrame(scrollToResultsOnMobile);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSelectTrip(id) {
    setError("");
    try {
      const data = await getTrip(id);
      setTrip(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const result = trip?.result;
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
    <div className="min-h-full bg-ink-50">
      <header className="print-hide border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-ink-900 p-2 text-amber-500">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-ink-900">RouteLog</p>
              <p className="text-xs text-ink-400">HOS trip planner &amp; ELD log generator</p>
            </div>
          </div>
          <p className="hidden text-xs text-ink-400 sm:block">
            Property carrier · 70&nbsp;hrs/8&nbsp;days · No adverse conditions
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="print-hide space-y-6">
            <TripForm onSubmit={handleSubmit} submitting={submitting} errorMessage={error} />
            <TripHistorySidebar
              trips={history}
              onSelect={handleSelectTrip}
              activeTripId={trip?.id}
              loading={historyLoading}
            />
          </aside>

          <section ref={resultsRef} className="min-w-0 space-y-6">
            {!result && (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ink-200 bg-white/50 px-6 text-center">
                <div className="rounded-full bg-ink-900 p-4 text-amber-500">
                  <Truck className="h-7 w-7" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-ink-800">No trip planned yet</h2>
                <p className="mt-1.5 max-w-sm text-sm text-ink-400">
                  Fill in the form to generate a route, stop schedule, and a full set of
                  FMCSA-style daily log sheets for your trip.
                </p>
              </div>
            )}

            {result && (
              <ErrorBoundary
                key={trip?.id}
                onReset={() => setTrip(null)}
                fallback={(_error, reset) => tripResultsFallback(reset)}
              >
                <TripResults result={result} vehicleInfo={vehicleInfo} />
              </ErrorBoundary>
            )}
          </section>
        </div>
      </main>

      <footer className="print-hide mt-10 border-t border-ink-200 py-6 text-center text-xs text-ink-400">
        Built for the FMCSA property-carrier HOS ruleset (49 CFR Part 395). Assumes no adverse
        driving conditions, a fuel stop every 1,000 miles, and 1 hour each for pickup and
        drop-off.
      </footer>
    </div>
  );
}
