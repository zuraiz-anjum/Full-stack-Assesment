// A small signature mark used next to the wordmark everywhere it appears --
// a winding route ending in a destination dot, standing in for a
// conventional logo icon. Cheap, distinctive, and reinforces "route
// planning" without relying on a generic stock icon in a colored box.
export default function RouteMark({ className = "" }) {
  return (
    <svg width="46" height="10" viewBox="0 0 46 10" fill="none" className={className} aria-hidden="true">
      <path
        d="M1 7 Q7 2 13 6 T25 5 T37 4"
        stroke="var(--color-amber-600)"
        strokeWidth="1.75"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="41" cy="4" r="3" fill="var(--color-amber-600)" />
      <circle cx="41" cy="4" r="1.1" fill="white" />
    </svg>
  );
}
