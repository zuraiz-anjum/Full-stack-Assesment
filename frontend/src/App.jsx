import { AlertTriangle, Search, Truck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import CommandPalette from "./components/CommandPalette";
import ErrorBoundary from "./components/ErrorBoundary";
import GlobeHero from "./components/GlobeHero";
import PlanningStatus from "./components/PlanningStatus";
import RouteMark from "./components/RouteMark";
import ThemeToggle from "./components/ThemeToggle";
import TripForm from "./components/TripForm";
import TripHistorySidebar from "./components/TripHistorySidebar";
import TripResults from "./components/TripResults";
import { extractErrorMessage, getTrip, listTrips, planTrip } from "./lib/api";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);

function tripResultsFallback(reset) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-red-200 bg-red-50 px-6 py-16 text-center dark:border-red-900/50 dark:bg-red-950/20">
      <AlertTriangle className="h-8 w-8 text-red-500" />
      <h2 className="text-lg font-semibold text-red-800 dark:text-red-300">Couldn't display this trip</h2>
      <p className="max-w-sm text-sm text-red-600 dark:text-red-400">
        Something about this trip's data didn't render correctly. Try planning a new trip, or
        picking a different one from your recent trips.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800"
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
      setHistory(await listTrips());
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
    homeTerminalAddress: vi.home_terminal_address,
    truckNumber: vi.truck_number,
    trailerNumber: vi.trailer_number,
    driverName: vi.driver_name,
    coDriverName: vi.co_driver_name,
    shippingDocNumber: vi.shipping_doc_number,
  };

  return (
    <div className="min-h-full bg-ink-50 dark:bg-transparent">
      <header className="print-hide border-b border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-950/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-ink-950 dark:text-ink-50" strokeWidth={1.75} />
            <div>
              <p className="flex items-center gap-2 text-sm font-bold tracking-tight text-ink-950 dark:text-ink-50">
                RouteLog
                <RouteMark />
              </p>
              <p className="text-xs text-ink-500 dark:text-ink-400">HOS trip planner &amp; ELD log generator</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-xs text-ink-500 sm:block dark:text-ink-400">
              Property carrier · 70&nbsp;hrs/8&nbsp;days · No adverse conditions
            </p>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("routelog:open-command-palette"))}
              className="flex items-center gap-1.5 rounded-lg border border-ink-100 px-2.5 py-1.5 text-xs text-ink-500 transition hover:border-ink-200 hover:bg-ink-50 dark:border-ink-800 dark:text-ink-400 dark:hover:border-ink-700 dark:hover:bg-ink-800"
            >
              <Search className="h-3.5 w-3.5" />
              <kbd className="hidden font-sans sm:inline">{isMac ? "⌘K" : "Ctrl K"}</kbd>
            </button>
            <ThemeToggle />
          </div>
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
              disabled={submitting}
            />
          </aside>

          <section ref={resultsRef} className="min-w-0 space-y-6">
            {!result && submitting && <PlanningStatus />}

            {!result && !submitting && (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-white/40 px-6 text-center dark:border-ink-800 dark:bg-ink-900/30">
                <GlobeHero />
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl dark:text-ink-50">
                  Where to next?
                </h2>
                <p className="mt-2 max-w-sm text-sm text-ink-500 dark:text-ink-400">
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
                <TripResults
                  result={result}
                  vehicleInfo={vehicleInfo}
                  tripId={trip?.id}
                  shareToken={trip?.share_token}
                />
              </ErrorBoundary>
            )}
          </section>
        </div>
      </main>

      <footer className="print-hide mt-10 border-t border-ink-100 py-6 text-center text-xs text-ink-500 dark:border-ink-800 dark:text-ink-500">
        Built for the FMCSA property-carrier HOS ruleset (49 CFR Part 395). Assumes no adverse
        driving conditions, a fuel stop every 1,000 miles, and 1 hour each for pickup and
        drop-off.
      </footer>

      <CommandPalette
        trips={history}
        onSelectTrip={handleSelectTrip}
        onNewTrip={() => setTrip(null)}
        activeTrip={trip}
        submitting={submitting}
      />
    </div>
  );
}
