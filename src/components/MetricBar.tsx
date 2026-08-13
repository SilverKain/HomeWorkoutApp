interface MetricBarProps {
  value: number
  max?: number
  tone?: 'warm' | 'cool' | 'success' | 'danger'
  label?: string
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function MetricBar({
  value,
  max = 100,
  tone = 'warm',
  label,
}: MetricBarProps) {
  const safeMax = max <= 0 ? 1 : max
  const percent = clamp((value / safeMax) * 100, 0, 100)

  return (
    <div className={`metric-bar metric-bar--${tone}`}>
      <div
        className="metric-bar__track"
        role="presentation"
        aria-hidden="true"
      >
        <span
          className="metric-bar__fill"
          style={{ width: `${percent}%` }}
        />
      </div>
      {label ? <span className="metric-bar__caption">{label}</span> : null}
    </div>
  )
}
