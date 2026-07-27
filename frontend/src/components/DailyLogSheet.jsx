import { MoveHorizontal } from "lucide-react";
import { useEffect, useRef } from "react";

const REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const ROWS = [
  { key: "OFF_DUTY", label: "Off Duty", color: "#a8a89c" },
  { key: "SLEEPER_BERTH", label: "Sleeper Berth", color: "#6d5ce8" },
  { key: "DRIVING", label: "Driving", color: "#1a7a3e" },
  { key: "ON_DUTY_NOT_DRIVING", label: "On Duty\n(Not Driving)", color: "#b45309" },
];
const ROW_INDEX = Object.fromEntries(ROWS.map((r, i) => [r.key, i]));

const GRID_X = 168;
const GRID_WIDTH = 792; // 24 * 33
const HOUR_WIDTH = GRID_WIDTH / 24;
const ROW_HEIGHT = 42;
const GRID_TOP = 34;
const GRID_HEIGHT = ROW_HEIGHT * ROWS.length;
const REMARKS_TOP = GRID_TOP + GRID_HEIGHT + 14;
const REMARKS_HEIGHT = 74;
const SVG_WIDTH = GRID_X + GRID_WIDTH + 90;
const SVG_HEIGHT = REMARKS_TOP + REMARKS_HEIGHT + 10;

function xForHour(hour) {
  return GRID_X + hour * HOUR_WIDTH;
}

function yForRow(rowIndex) {
  return GRID_TOP + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
}

function hourLabel(h) {
  if (h === 0) return "Mid night";
  if (h === 12) return "Noon";
  if (h > 12) return String(h);
  return String(h);
}

export function formatClock(hourFloat) {
  let h = Math.floor(hourFloat) % 24;
  let m = Math.round((hourFloat - Math.floor(hourFloat)) * 60);
  if (m === 60) {
    // Rounding a fractional hour (e.g. 11.9999996) can land exactly on the
    // next minute mark — roll it over instead of printing "11:60".
    m = 0;
    h = (h + 1) % 24;
  }
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function buildStepPath(blocks) {
  if (!blocks || blocks.length === 0) return "";
  const points = [];
  blocks.forEach((block, i) => {
    const y = yForRow(ROW_INDEX[block.status]);
    const xStart = xForHour(block.start_hour);
    const xEnd = xForHour(block.end_hour);
    if (i === 0) points.push([xStart, y]);
    else points.push([xStart, y]);
    points.push([xEnd, y]);
  });
  return "M " + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ");
}

function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] tracking-wide text-ink-500 uppercase">{label}</p>
      <p className="truncate border-b border-ink-200 pb-1 text-sm text-ink-800">
        {value || <span className="text-ink-300">&mdash;</span>}
      </p>
    </div>
  );
}

export default function DailyLogSheet({ log, meta, vehicleInfo = {} }) {
  const stepPath = buildStepPath(log.blocks);
  const pathRef = useRef(null);
  const vehicleNumbers = [vehicleInfo.truckNumber, vehicleInfo.trailerNumber]
    .filter(Boolean)
    .join(" / ");

  useEffect(() => {
    const path = pathRef.current;
    if (!path || REDUCED_MOTION || typeof path.getTotalLength !== "function") return;
    const length = path.getTotalLength();
    if (!length) return;
    path.style.transition = "none";
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    path.getBoundingClientRect();
    path.style.transition = "stroke-dashoffset 1s cubic-bezier(0.65, 0, 0.35, 1)";
    const raf = requestAnimationFrame(() => {
      path.style.strokeDashoffset = "0";
    });
    return () => cancelAnimationFrame(raf);
  }, [stepPath]);

  return (
    <div className="rounded-xl border border-ink-100 bg-white p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-base font-bold tracking-tight text-ink-950">
            Day {log.day_index} &mdash;{" "}
            {new Date(log.date + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </h3>
          {meta && <p className="text-xs text-ink-500">{meta}</p>}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {ROWS.map((r) => (
            <span key={r.key} className="flex items-center gap-1.5 text-ink-500">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
              {r.label.replace("\n", " ")}: <strong className="text-ink-900">{(log.totals?.[r.key] ?? 0).toFixed(2)}h</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-ink-50 p-4 sm:grid-cols-4 print:grid-cols-2">
        <Field label="Total miles driving today" value={`${(log.total_miles ?? 0).toFixed(1)} mi`} />
        <Field label="Truck / trailer no." value={vehicleNumbers} />
        <Field label="Driver" value={vehicleInfo.driverName} />
        <Field label="Co-driver" value={vehicleInfo.coDriverName} />
        <Field label="Carrier" value={vehicleInfo.carrierName} />
        <Field label="Main office address" value={vehicleInfo.mainOfficeAddress} />
        <Field
          label="Shipping doc # / shipper & commodity"
          value={vehicleInfo.shippingDocNumber}
        />
        <Field label="Driver signature" value={vehicleInfo.driverName ? "(certified above)" : ""} />
      </div>

      <p className="mb-1.5 flex items-center gap-1 text-xs text-ink-500 sm:hidden print:hidden">
        <MoveHorizontal className="h-3.5 w-3.5" />
        Swipe to see the full 24-hour grid
      </p>
      <div className="overflow-x-auto print:overflow-visible">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="min-w-[820px] print:w-full print:min-w-0"
          role="img"
          aria-label={`ELD daily log grid for day ${log.day_index}`}
        >
          {/* Hour labels */}
          {Array.from({ length: 24 }, (_, h) => (
            <text
              key={`hl-${h}`}
              x={xForHour(h)}
              y={GRID_TOP - 10}
              fontSize="9"
              textAnchor="middle"
              fill="#6b6b61"
            >
              {hourLabel(h)}
            </text>
          ))}

          {/* Vertical hour + quarter-hour gridlines */}
          {Array.from({ length: 97 }, (_, i) => {
            const hour = i / 4;
            const x = xForHour(hour);
            const isHour = i % 4 === 0;
            const isSix = i % 24 === 0;
            return (
              <line
                key={`v-${i}`}
                x1={x}
                y1={GRID_TOP}
                x2={x}
                y2={GRID_TOP + GRID_HEIGHT}
                stroke={isSix ? "#40403a" : isHour ? "#b8b8ac" : "#efeee7"}
                strokeWidth={isSix ? 1.4 : isHour ? 1 : 0.6}
              />
            );
          })}

          {/* Row bands + horizontal lines + labels */}
          {ROWS.map((row, i) => (
            <g key={row.key}>
              <rect
                x={GRID_X}
                y={GRID_TOP + i * ROW_HEIGHT}
                width={GRID_WIDTH}
                height={ROW_HEIGHT}
                fill={i % 2 === 0 ? "#faf9f6" : "#ffffff"}
              />
              <line
                x1={GRID_X}
                y1={GRID_TOP + i * ROW_HEIGHT}
                x2={GRID_X + GRID_WIDTH}
                y2={GRID_TOP + i * ROW_HEIGHT}
                stroke="#e2e0d8"
                strokeWidth={1}
              />
              {row.label.split("\n").map((line, li) => (
                <text
                  key={li}
                  x={GRID_X - 10}
                  y={GRID_TOP + i * ROW_HEIGHT + ROW_HEIGHT / 2 + (li === 0 && row.label.includes("\n") ? -3 : 8)}
                  fontSize="11"
                  fontWeight="600"
                  textAnchor="end"
                  fill="#18180f"
                >
                  {line}
                </text>
              ))}
              <text
                x={GRID_X + GRID_WIDTH + 14}
                y={GRID_TOP + i * ROW_HEIGHT + ROW_HEIGHT / 2 + 4}
                fontSize="12"
                fontWeight="700"
                fill={row.color}
              >
                {(log.totals?.[row.key] ?? 0).toFixed(2)}
              </text>
            </g>
          ))}
          <line
            x1={GRID_X}
            y1={GRID_TOP + GRID_HEIGHT}
            x2={GRID_X + GRID_WIDTH}
            y2={GRID_TOP + GRID_HEIGHT}
            stroke="#40403a"
            strokeWidth={1.4}
          />
          <line
            x1={GRID_X}
            y1={GRID_TOP}
            x2={GRID_X}
            y2={GRID_TOP + GRID_HEIGHT}
            stroke="#40403a"
            strokeWidth={1.4}
          />
          <line
            x1={GRID_X + GRID_WIDTH}
            y1={GRID_TOP}
            x2={GRID_X + GRID_WIDTH}
            y2={GRID_TOP + GRID_HEIGHT}
            stroke="#40403a"
            strokeWidth={1.4}
          />

          {/* Filled block segments, colored by status */}
          {(log.blocks ?? []).map((block, i) => {
            const y = yForRow(ROW_INDEX[block.status]);
            const x = xForHour(block.start_hour);
            const w = xForHour(block.end_hour) - x;
            const color = ROWS[ROW_INDEX[block.status]].color;
            return (
              <rect
                key={i}
                x={x}
                y={y - 4}
                width={Math.max(w, 0)}
                height={8}
                fill={color}
                opacity={0.22}
              />
            );
          })}

          {/* Bold step trace */}
          <path ref={pathRef} d={stepPath} fill="none" stroke="#0a0a08" strokeWidth={2.25} strokeLinejoin="round" />

          {/* Remarks track */}
          <line
            x1={GRID_X}
            y1={REMARKS_TOP}
            x2={GRID_X + GRID_WIDTH}
            y2={REMARKS_TOP}
            stroke="#e2e0d8"
            strokeWidth={1}
          />
          {(log.remarks ?? []).map((r, i) => {
            const x = xForHour(r.hour);
            return (
              <g key={i}>
                <line x1={x} y1={GRID_TOP} x2={x} y2={REMARKS_TOP + 4} stroke="#b45309" strokeDasharray="2 2" strokeWidth={1} />
                <circle cx={x} cy={REMARKS_TOP} r={2.5} fill="#b45309" />
                <text
                  x={x + 4}
                  y={REMARKS_TOP + 12}
                  fontSize="9.5"
                  fill="#40403a"
                  transform={`rotate(38 ${x + 4} ${REMARKS_TOP + 12})`}
                >
                  {formatClock(r.hour)} &middot; {r.location_label || r.activity_label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
