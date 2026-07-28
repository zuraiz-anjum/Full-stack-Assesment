import { Check, Download, Loader2, Play, Printer, Share2 } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { downloadTripPdf } from "../lib/api";
import ComplianceBadge from "./ComplianceBadge";
import DailyLogSheet from "./DailyLogSheet";
import RouteDirections from "./RouteDirections";
import ShareImageButton from "./ShareImageButton";
import SummaryCards from "./SummaryCards";

// Leaflet is the single heaviest dependency in the bundle and isn't needed
// until a trip actually exists — split it into its own chunk so the form
// (what every visitor sees first, often on mobile) loads and becomes
// interactive without waiting on map code to parse.
const MapView = lazy(() => import("./MapView"));

function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-xl border border-ink-100 bg-ink-50 dark:border-ink-800 dark:bg-ink-900">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink-200 border-t-ink-700 dark:border-ink-700 dark:border-t-ink-300" />
    </div>
  );
}

// Everything here reads from `result`/`vehicleInfo` inside THIS component's
// own render, rather than as inline JSX prop expressions in App.jsx's
// render. That matters: React error boundaries only catch errors thrown by
// their descendants, never by their own parent's render — so if a stored
// trip has an unexpected/missing shape, the crash needs to happen in here
// (a child of the boundary App wraps this in) to actually be caught.
export default function TripResults({ result, vehicleInfo, tripId, shareToken }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [copied, setCopied] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [highlightedLabel, setHighlightedLabel] = useState(null);

  async function handleShare() {
    const url = `${window.location.origin}/shared/${shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link to share the trip:", url);
    }
  }

  async function handleDownloadPdf() {
    setDownloading(true);
    setDownloadError("");
    try {
      const blob = await downloadTripPdf(tripId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `trip-${tripId}-daily-logs.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Couldn't generate the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <div className="print-hide space-y-6">
        <ComplianceBadge key={tripId} result={result} />
        <SummaryCards summary={result.summary} route={result.route} />
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-300">Route</h2>
            <button
              type="button"
              onClick={() => setReplaying(true)}
              disabled={replaying}
              className="flex items-center gap-1.5 rounded-lg border border-ink-100 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:border-ink-200 hover:bg-ink-50 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300 dark:hover:border-ink-700 dark:hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play className="h-3.5 w-3.5" />
              {replaying ? "Replaying…" : "Play replay"}
            </button>
          </div>
          <div className="h-[280px] sm:h-[420px]">
            <Suspense fallback={<MapSkeleton />}>
              <MapView
                waypoints={result.waypoints}
                geometry={result.route.geometry}
                stops={result.stops}
                replaying={replaying}
                onReplayDone={() => setReplaying(false)}
                highlightLabel={highlightedLabel}
              />
            </Suspense>
          </div>
        </div>
        <RouteDirections legs={result.route.legs} />
      </div>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <h2 className="text-lg font-bold tracking-tight text-ink-950 dark:text-ink-50">
            Daily log sheets ({result.daily_logs.length})
          </h2>
          <div className="print-hide flex flex-wrap items-center gap-2">
            {shareToken && (
              <button
                type="button"
                onClick={handleShare}
                className="flex items-center gap-1.5 rounded-lg border border-ink-100 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:border-ink-200 hover:bg-ink-50 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300 dark:hover:border-ink-700 dark:hover:bg-ink-800"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" />
                )}
                {copied ? "Link copied" : "Share"}
              </button>
            )}
            <ShareImageButton result={result} tripId={tripId} />
            {tripId && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloading}
                className="flex items-center gap-1.5 rounded-lg border border-ink-100 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:border-ink-200 hover:bg-ink-50 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300 dark:hover:border-ink-700 dark:hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {downloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Download PDF
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border border-ink-100 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:border-ink-200 hover:bg-ink-50 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300 dark:hover:border-ink-700 dark:hover:bg-ink-800"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
          </div>
        </div>
        <p className="print-hide text-xs font-semibold text-ink-500 dark:text-ink-400">
          The downloaded PDF has the exact format required.
        </p>
        {downloadError && (
          <p className="print-hide -mt-3 text-xs text-red-600 dark:text-red-400">{downloadError}</p>
        )}
        {result.daily_logs.map((log) => (
          <div key={log.date} className="print-area">
            <DailyLogSheet log={log} vehicleInfo={vehicleInfo} onHighlightLocation={setHighlightedLabel} />
          </div>
        ))}
      </div>
    </>
  );
}
