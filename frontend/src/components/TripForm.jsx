import { ChevronDown, Flag, Loader2, MapPin, Navigation, Send, Truck } from "lucide-react";
import { useState } from "react";
import LocationInput from "./LocationInput";

const DEFAULTS = {
  currentLocation: "",
  pickupLocation: "",
  dropoffLocation: "",
  currentCycleUsedHours: "",
  carrierName: "",
  mainOfficeAddress: "",
  truckNumber: "",
  trailerNumber: "",
  driverName: "",
  coDriverName: "",
  shippingDocNumber: "",
};

const VEHICLE_FIELDS = [
  { key: "driverName", label: "Driver name", placeholder: "e.g. John Doe" },
  { key: "coDriverName", label: "Co-driver name", placeholder: "Optional" },
  { key: "carrierName", label: "Carrier name", placeholder: "e.g. Acme Freight LLC" },
  { key: "mainOfficeAddress", label: "Main office address", placeholder: "City, State" },
  { key: "truckNumber", label: "Truck/tractor number", placeholder: "e.g. T-4471" },
  { key: "trailerNumber", label: "Trailer number", placeholder: "e.g. TR-2209" },
  {
    key: "shippingDocNumber",
    label: "Shipping doc # / shipper & commodity",
    placeholder: "e.g. PRO 101601, Dry goods",
  },
];

export default function TripForm({ onSubmit, submitting, errorMessage }) {
  const [form, setForm] = useState(DEFAULTS);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
      carrierName: form.carrierName,
      mainOfficeAddress: form.mainOfficeAddress,
      truckNumber: form.truckNumber,
      trailerNumber: form.trailerNumber,
      driverName: form.driverName,
      coDriverName: form.coDriverName,
      shippingDocNumber: form.shippingDocNumber,
    });
  }

  const cycleHours = Number(form.currentCycleUsedHours) || 0;

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-ink-100 bg-white p-6 sm:p-7">
      <h2 className="text-xl font-bold tracking-tight text-ink-950">Plan a trip</h2>
      <p className="mt-1.5 text-sm text-ink-500">
        Enter your current position and the load's pickup and drop-off points. We'll build the
        route and a compliant set of daily ELD logs for the whole trip.
      </p>

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <span className="text-sm text-ink-500">/ 70 hrs</span>
          </div>
          <p className="mt-1.5 text-xs text-ink-500">
            Hours already on duty in the current 70-hour/8-day cycle, per your ELD.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen((v) => !v)}
        className="mt-5 flex w-full items-center justify-between rounded-lg border border-ink-100 bg-ink-50 px-3 py-2.5 text-sm font-medium text-ink-600 transition hover:border-ink-200 hover:bg-ink-100"
      >
        <span className="flex items-center gap-2">
          <Truck className="h-4 w-4" />
          Carrier &amp; vehicle details (optional)
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
        />
      </button>

      {detailsOpen && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {VEHICLE_FIELDS.map((f) => (
            <div key={f.key} className={f.key === "shippingDocNumber" ? "sm:col-span-2" : ""}>
              <label htmlFor={f.key} className="mb-1.5 block text-sm font-medium text-ink-700">
                {f.label}
              </label>
              <input
                id={f.key}
                type="text"
                value={form[f.key]}
                onChange={(e) => update(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          ))}
          <p className="text-xs text-ink-500 sm:col-span-2">
            These fill in the carrier/vehicle fields on the printed daily log sheets. Leave blank
            and they'll just show as empty on the form, same as a driver who fills it in later.
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 py-3 text-sm font-semibold text-white transition duration-150 hover:-translate-y-0.5 hover:bg-ink-800 hover:shadow-lg hover:shadow-ink-950/10 active:translate-y-0 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none"
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
