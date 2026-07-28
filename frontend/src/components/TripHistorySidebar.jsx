import { ArrowRight, Clock3, History } from "lucide-react";

export default function TripHistorySidebar({ trips, onSelect, activeTripId, loading, disabled }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900/40">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-950 dark:text-ink-50">
        <History className="h-4 w-4 text-ink-500 dark:text-ink-400" />
        Recent trips
      </div>

      {loading && <p className="text-sm text-ink-500 dark:text-ink-400">Loading…</p>}
      {!loading && trips.length === 0 && (
        <p className="text-sm text-ink-500 dark:text-ink-400">Your planned trips will show up here.</p>
      )}

      <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {trips.map((trip) => (
          <li key={trip.id}>
            <button
              type="button"
              onClick={() => onSelect(trip.id)}
              disabled={disabled}
              className={`group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition disabled:pointer-events-none disabled:opacity-50 ${
                trip.id === activeTripId
                  ? "bg-ink-950 text-white"
                  : "text-ink-700 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {trip.pickup_location} <ArrowRight className="inline h-3 w-3" /> {trip.dropoff_location}
                </p>
                <p
                  className={`mt-0.5 flex items-center gap-1 text-xs ${
                    trip.id === activeTripId ? "text-ink-300" : "text-ink-500 dark:text-ink-400"
                  }`}
                >
                  <Clock3 className="h-3 w-3" />
                  {new Date(trip.created_at).toLocaleString()}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
