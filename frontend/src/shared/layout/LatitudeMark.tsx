/** A latitude graticule: a quiet navigational motif. */
export function LatitudeMark() {
  return <svg className="latitude-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <circle cx="16" cy="16" r="12.5" />
    <ellipse cx="16" cy="16" rx="5.5" ry="12.5" />
    <path d="M4 12h24M4 20h24M3.5 16h25" />
    <circle className="latitude-mark-point" cx="24.5" cy="7.5" r="3" />
  </svg>
}
