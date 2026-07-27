import { Flag, Loader2, MapPin, Navigation, Send } from "lucide-react";
import { useState } from "react";
import LocationInput from "./LocationInput";

const DEFAULTS = {
  currentLocation: "",
  pickupLocation: "",
  dropoffLocation: "",
  currentCycleUsedHours: "",
};

export default function TripForm({ onSubmit, submitting, errorMessage }) {
  const [form, setForm] = useState(DEFAULTS);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({
      currentLocation: form.currentLocation,
      pickupLocation: form.pickupLocation,
      dropoffLocation: form.dropoffLocation,
      currentCycleUsedHours: Number(form.currentCycleUsedHours),
    });
  }

  const cycleHours = Number(form.currentCycleUsedHours) || 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <h2 className="text-lg font-semibold text-ink-900">Plan a trip</h2>
      <p className="mt-1 text-sm text-ink-500">
        Enter your current position and the load's pickup and drop-off points. We'll build the
        route and a compliant set of daily ELD logs for the whole trip.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <LocationInput
            id="current"
            label="Current location"
            placeholder="e.g. Chicago, IL"
            icon={Navigation}
            value={form.currentLocation}
            onChange={(v) => update("currentLocation", v)}
          />
        </div>
        <LocationInput
          id="pickup"
          label="Pickup location"
          placeholder="e.g. Indianapolis, IN"
          icon={MapPin}
          value={form.pickupLocation}
          onChange={(v) => update("pickupLocation", v)}
        />
        <LocationInput
          id="dropoff"
          label="Drop-off location"
          placeholder="e.g. Nashville, TN"
          icon={Flag}
          value={form.dropoffLocation}
          onChange={(v) => update("dropoffLocation", v)}
        />

        <div className="sm:col-span-2">
          <label htmlFor="cycle" className="mb-1.5 block text-sm font-medium text-ink-700">
            Current cycle used (hours)
          </label>
          <div className="flex items-center gap-4">
            <input
              id="cycle-range"
              aria-label="Current cycle used, hours (slider)"
              type="range"
              min="0"
              max="70"
              step="0.5"
              value={cycleHours}
              onChange={(e) => update("currentCycleUsedHours", e.target.value)}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-ink-200 accent-amber-500"
            />
            <input
              id="cycle"
              type="number"
              min="0"
              max="70"
              step="0.5"
              value={form.currentCycleUsedHours}
              onChange={(e) => update("currentCycleUsedHours", e.target.value)}
              placeholder="0"
              required
              className="w-20 rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-center text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            />
            <span className="text-sm text-ink-400">/ 70 hrs</span>
          </div>
          <p className="mt-1.5 text-xs text-ink-400">
            Hours already on duty in the current 70-hour/8-day cycle, per your ELD.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Planning trip…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Generate route &amp; logs
          </>
        )}
      </button>
    </form>
  );
}
