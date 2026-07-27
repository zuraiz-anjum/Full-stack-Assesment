import { CalendarDays, Clock, Fuel, Gauge, Moon, Route } from "lucide-react";

function Card({ icon: Icon, label, value, sub }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
      <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium whitespace-nowrap text-ink-400">{label}</p>
        <p className="text-lg leading-tight font-semibold whitespace-nowrap text-ink-900">
          {value}
        </p>
        {sub && <p className="text-xs whitespace-nowrap text-ink-400">{sub}</p>}
      </div>
    </div>
  );
}

export default function SummaryCards({ summary, route }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Card icon={Route} label="Total distance" value={`${route.total_distance_miles.toLocaleString()} mi`} />
      <Card icon={Clock} label="Driving time" value={`${summary.driving_hours}h`} />
      <Card
        icon={CalendarDays}
        label="Trip length"
        value={`${summary.total_days} day${summary.total_days === 1 ? "" : "s"}`}
        sub={`${summary.total_trip_duration_hours}h total`}
      />
      <Card icon={Moon} label="Required rests" value={summary.num_10hr_resets} sub="10-hr resets" />
      <Card icon={Fuel} label="Fuel stops" value={summary.num_fuel_stops} sub="every 1,000 mi" />
      <Card icon={Gauge} label="34-hr restarts" value={summary.num_34hr_restarts} />
    </div>
  );
}
