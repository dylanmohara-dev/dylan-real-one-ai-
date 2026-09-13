// Each life area gets its own transition "flavor" rather than one shape
// recolored nine ways -- School rises like a page turning, Gym punches in,
// Health breathes with a soft pulse, Finance/Calendar snap into focus like
// a lens, Discipline cuts in sharp and fast. The Wipe/Fade setting in
// Settings -> Display still controls the background sweep and overall
// duration; this only changes what the icon+label do inside it.
const FLAVORS = {
  school: 'riseIn',
  reading: 'riseIn',
  sports: 'swoosh',
  discipline: 'snap',
  gym: 'punch',
  skills: 'punch',
  health: 'pulse',
  family: 'pulse',
  finance: 'iris',
  calendar: 'iris',
  journal: 'dissolve',
}

export default function ModeTransition({ flashKey, animation, mode }) {
  const Icon = mode?.icon
  const flavor = FLAVORS[mode?.key] || 'dissolve'

  return (
    <div key={flashKey} className={`mode-flash anim-${animation}`}>
      <div className={`mode-flash-content flavor-${flavor}`}>
        {Icon && <Icon size={52} strokeWidth={1.5} className="mode-flash-icon" />}
        <span className="mode-flash-label">{mode?.title || 'Overview'}</span>
      </div>
    </div>
  )
}
