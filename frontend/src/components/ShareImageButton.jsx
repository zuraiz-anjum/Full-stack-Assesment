import { Camera, Loader2 } from "lucide-react";
import { useState } from "react";
import { generateTripSummaryImage } from "../lib/shareImage";

export default function ShareImageButton({ result, tripId, className = "" }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const blob = await generateTripSummaryImage(result);
      if (!blob) return;
      const filename = `routelog-trip-${tripId ?? "summary"}.png`;
      const file = new File([blob], filename, { type: "image/png" });

      // Web Share API with a file attachment is mainly a mobile thing (iOS
      // Safari, Chrome on Android) -- that's exactly the "share this trip"
      // gesture users reach for on a phone, so prefer it when available and
      // fall back to a plain download everywhere else (most desktop
      // browsers don't support sharing files at all).
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "RouteLog trip summary",
          text: "My HOS-compliant trip plan, from RouteLog.",
        });
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      // AbortError fires when the user just closes the native share sheet --
      // not an error worth surfacing.
      if (err?.name !== "AbortError") {
        console.error("Couldn't generate the summary image:", err);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={
        className ||
        "flex items-center gap-1.5 rounded-lg border border-ink-100 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:border-ink-200 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300 dark:hover:border-ink-700 dark:hover:bg-ink-800"
      }
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
      Share image
    </button>
  );
}
