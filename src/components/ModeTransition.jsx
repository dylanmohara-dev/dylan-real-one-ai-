export default function ModeTransition({ flashKey, animation, mode }) {
  const Icon = mode?.icon

  return (
    <div key={flashKey} className={`mode-flash anim-${animation}`}>
      <div className="mode-flash-content">
        {Icon && <Icon size={52} strokeWidth={1.5} className="mode-flash-icon" />}
        <span className="mode-flash-label">{mode?.title || 'Overview'}</span>
      </div>
    </div>
  )
}
