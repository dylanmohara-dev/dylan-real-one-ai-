// Small reusable SVG ring: fills clockwise from 12 o'clock to `percent`,
// in the current mode's accent color. Built for School's per-class grade
// ring but written generic (no School-specific naming) so any other mode
// can reuse it for its own "progress at a glance" number.
export default function RadialProgress({ percent, size = 40, strokeWidth = 4, label }) {
  const clamped = percent === null || percent === undefined ? 0 : Math.max(0, Math.min(100, percent))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="radial-progress" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
      {percent !== null && percent !== undefined && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--mode-accent-rgb))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="radial-progress-fill"
        />
      )}
      {label !== undefined && (
        <text x="50%" y="51%" textAnchor="middle" dominantBaseline="central" className="radial-progress-label">
          {label}
        </text>
      )}
    </svg>
  )
}
