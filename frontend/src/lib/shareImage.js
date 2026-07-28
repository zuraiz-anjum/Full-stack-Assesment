// Renders a shareable trip summary card entirely with the Canvas 2D API --
// no html-to-image dependency, no network tile fetch (the route is drawn
// from the already-loaded geometry, normalized into a small inset), so it
// works offline and stays consistent with the rest of the app's hand-drawn
// SVG components (RouteMark, ComplianceBadge, GlobeHero all do the same).

const WIDTH = 1200;
const HEIGHT = 630;

// Same path data as the header's Truck icon (lucide-react "truck"), reused
// via Path2D so the corner mark matches the on-screen logo exactly.
const TRUCK_PATHS = [
  "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2",
  "M15 18H9",
  "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14",
];
const TRUCK_WHEELS = [
  { cx: 17, cy: 18, r: 2 },
  { cx: 7, cy: 18, r: 2 },
];

const SHIELD_PATH = "M13 2.5 L22.5 6 V12.5 C22.5 18.5 18.5 22.5 13 23.5 C7.5 22.5 3.5 18.5 3.5 12.5 V6 Z";
const CHECK_PATH = "M8.5 13 L11.5 16 L17.5 9.5";

const INK_950 = "#0a0a08";
const INK_700 = "#40403a";
const INK_500 = "#6b6b61";
const INK_100 = "#efeee7";
const INK_50 = "#faf9f6";
const AMBER = "#b45309";
const GREEN = "#1a7a3e";
const RED = "#dc2626";

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawLogo(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK_950;
  ctx.lineWidth = 2.1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const d of TRUCK_PATHS) ctx.stroke(new Path2D(d));
  for (const w of TRUCK_WHEELS) {
    const c = new Path2D();
    c.arc(w.cx, w.cy, w.r, 0, Math.PI * 2);
    ctx.stroke(c);
  }
  ctx.restore();
}

function drawComplianceBadge(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 1.75;
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(SHIELD_PATH));
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.stroke(new Path2D(CHECK_PATH));
  ctx.restore();
}

function normalizeGeometry(geometry, box) {
  if (!geometry || geometry.length < 2) return [];
  const lats = geometry.map((p) => p[0]);
  const lons = geometry.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latRange = maxLat - minLat || 1;
  const lonRange = maxLon - minLon || 1;
  const scale = Math.min(box.w / lonRange, box.h / latRange) * 0.82;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const midLat = (minLat + maxLat) / 2;
  const midLon = (minLon + maxLon) / 2;
  return geometry.map(([lat, lon]) => [
    cx + (lon - midLon) * scale,
    // Screen y grows downward, latitude grows northward -- flip.
    cy - (lat - midLat) * scale,
  ]);
}

async function ensureFontsReady() {
  if (!document.fonts?.ready) return;
  try {
    await document.fonts.load("700 40px Inter");
    await document.fonts.load("600 20px Inter");
    await document.fonts.load("400 20px Inter");
    await document.fonts.ready;
  } catch {
    // Canvas text still renders with a fallback sans-serif if this fails.
  }
}

function statBlock(ctx, x, y, label, value, sub) {
  ctx.fillStyle = INK_500;
  ctx.font = "600 17px Inter, sans-serif";
  ctx.fillText(label.toUpperCase(), x, y);
  ctx.fillStyle = INK_950;
  ctx.font = "700 34px Inter, sans-serif";
  ctx.fillText(value, x, y + 42);
  if (sub) {
    ctx.fillStyle = INK_500;
    ctx.font = "400 15px Inter, sans-serif";
    ctx.fillText(sub, x, y + 64);
  }
}

export async function generateTripSummaryImage(result) {
  await ensureFontsReady();

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");

  // Paper background + amber corner accent.
  ctx.fillStyle = INK_50;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = AMBER;
  ctx.fillRect(0, 0, WIDTH, 8);

  // Header: logo + wordmark.
  drawLogo(ctx, 60, 52);
  ctx.fillStyle = INK_950;
  ctx.font = "700 26px Inter, sans-serif";
  ctx.fillText("RouteLog", 96, 76);
  ctx.fillStyle = INK_500;
  ctx.font = "400 15px Inter, sans-serif";
  ctx.fillText("HOS trip planner & ELD log generator", 96, 96);

  // Route headline. Every trip here is domestic (this is a US FMCSA HOS
  // tool), so the ", USA" country suffix Nominatim always appends is dead
  // weight -- stripping it buys real room before anything needs shrinking.
  const shortLabel = (label) => (label ?? "").replace(/,\s*USA$/i, "");
  const pickup = shortLabel(result.waypoints?.pickup?.label) || "Pickup";
  const dropoff = shortLabel(result.waypoints?.dropoff?.label) || "Drop-off";
  ctx.fillStyle = INK_950;
  const headline = `${pickup}  →  ${dropoff}`;
  // The route inset box (drawn later, starts at x=660) paints over anything
  // that overflows into it, so this needs real clearance from x=58. Shrink
  // the font to fit first (keeps both place names fully readable for the
  // common case) and only fall back to an ellipsis at the floor size.
  const maxHeadlineWidth = 580;
  let fontSize = 44;
  const minFontSize = 26;
  ctx.font = `700 ${fontSize}px Inter, sans-serif`;
  while (ctx.measureText(headline).width > maxHeadlineWidth && fontSize > minFontSize) {
    fontSize -= 2;
    ctx.font = `700 ${fontSize}px Inter, sans-serif`;
  }
  let headlineText = headline;
  let truncated = false;
  while (
    ctx.measureText(headlineText + (truncated ? "…" : "")).width > maxHeadlineWidth &&
    headlineText.length > 5
  ) {
    headlineText = headlineText.slice(0, -1).trimEnd();
    truncated = true;
  }
  ctx.fillText(truncated ? `${headlineText}…` : headlineText, 58, 200);

  // Compliance line.
  drawComplianceBadge(ctx, 60, 222, 0.9);
  ctx.fillStyle = INK_700;
  ctx.font = "600 18px Inter, sans-serif";
  ctx.fillText("HOS compliant · 49 CFR Part 395", 90, 244);

  // Stat grid (2x2), left column.
  const stats = [
    ["Total distance", `${Math.round(result.route.total_distance_miles).toLocaleString()} mi`, null],
    ["Driving time", `${result.summary.driving_hours.toFixed(1)}h`, null],
    ["Trip length", `${result.summary.total_days} day${result.summary.total_days === 1 ? "" : "s"}`, `${result.summary.total_trip_duration_hours}h total`],
    ["Required rests", `${result.summary.num_10hr_resets}`, "10-hr resets"],
  ];
  const colX = [60, 340];
  const rowY = [330, 430];
  stats.forEach(([label, value, sub], i) => {
    statBlock(ctx, colX[i % 2], rowY[Math.floor(i / 2)], label, value, sub);
  });

  // Route inset (right side): normalized polyline + waypoint dots.
  const box = { x: 660, w: 480, h: 380 };
  box.y = (HEIGHT - box.h) / 2 + 20;
  roundRect(ctx, box.x, box.y, box.w, box.h, 20);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = INK_100;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const inset = { x: box.x + 30, y: box.y + 30, w: box.w - 60, h: box.h - 60 };
  const points = normalizeGeometry(result.route.geometry, inset);
  if (points.length > 1) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
    ctx.strokeStyle = INK_950;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    const dot = (pt, color) => {
      if (!pt) return;
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 9, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 9, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    };
    dot(points[0], INK_700);
    dot(points[points.length - 1], RED);
  }

  // Footer.
  ctx.fillStyle = INK_500;
  ctx.font = "400 14px Inter, sans-serif";
  ctx.fillText(
    `Generated ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · routelog`,
    58,
    HEIGHT - 34,
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}
