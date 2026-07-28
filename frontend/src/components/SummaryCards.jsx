import { CalendarDays, Clock, Fuel, Gauge, Moon, Route } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(REDUCED_MOTION ? target : 0);
  const raf = useRef(null);

  useEffect(() => {
    if (REDUCED_MOTION || typeof target !== "number" || Number.isNaN(target)) {
      setValue(target);
      return;
    }
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) ** 3; // ease-out cubic
      setValue(target * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return value;
}

function Card({ icon: Icon, label, value, format, sub, delay = 0 }) {
  const animated = useCountUp(typeof value === "number" ? value : 0);
  const display = typeof value === "number" ? format(animated) : value;

  return (
    <div
      className="animate-fade-in-up flex items-start gap-3 overflow-hidden rounded-xl border border-ink-100 bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-md hover:shadow-ink-950/5 dark:border-ink-800 dark:bg-ink-900/40 dark:hover:border-ink-700 dark:hover:shadow-none"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="shrink-0 rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-ink-500 dark:text-ink-400">{label}</p>
        <p className="text-lg leading-tight font-semibold break-words text-ink-950 tabular-nums dark:text-ink-50">
          {display}
        </p>
        {sub && <p className="truncate text-xs text-ink-500 dark:text-ink-400">{sub}</p>}
      </div>
    </div>
  );
}

export default function SummaryCards({ summary, route }) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3">
      <Card
        icon={Route}
        label="Total distance"
        value={route.total_distance_miles}
        format={(v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} mi`}
        delay={0}
      />
      <Card
        icon={Clock}
        label="Driving time"
        value={summary.driving_hours}
        format={(v) => `${v.toFixed(1)}h`}
        delay={40}
      />
      <Card
        icon={CalendarDays}
        label="Trip length"
        value={summary.total_days}
        format={(v) => `${Math.round(v)} day${Math.round(v) === 1 ? "" : "s"}`}
        sub={`${summary.total_trip_duration_hours}h total`}
        delay={80}
      />
      <Card
        icon={Moon}
        label="Required rests"
        value={summary.num_10hr_resets}
        format={(v) => Math.round(v)}
        sub="10-hr resets"
        delay={120}
      />
      <Card
        icon={Fuel}
        label="Fuel stops"
        value={summary.num_fuel_stops}
        format={(v) => Math.round(v)}
        sub="every 1,000 mi"
        delay={160}
      />
      <Card
        icon={Gauge}
        label="34-hr restarts"
        value={summary.num_34hr_restarts}
        format={(v) => Math.round(v)}
        delay={200}
      />
    </div>
  );
}
