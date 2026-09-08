import { MODE_BACKGROUND_ICONS } from '../data/modeBackgrounds.js'

// Deterministic pseudo-random generator so a mode's icon pattern is stable
// across re-renders instead of reshuffling every time state changes.
function createSeededRandom(seed) {
  let value = seed
  return () => {
    value = (value * 9301 + 49297) % 233280
    return value / 233280
  }
}

export default function ModeBackground({ modeKey }) {
  const icons = MODE_BACKGROUND_ICONS[modeKey]

  if (!icons || !icons.length) return null

  const seed = Array.from(modeKey).reduce((acc, char) => acc + char.charCodeAt(0), 17)
  const random = createSeededRandom(seed)

  const tiles = Array.from({ length: 18 }, (_, index) => {
    const Icon = icons[index % icons.length]

    return {
      Icon,
      top: `${(random() * 110 - 5).toFixed(1)}%`,
      left: `${(random() * 110 - 5).toFixed(1)}%`,
      size: 56 + Math.round(random() * 64),
      rotate: Math.round(random() * 50 - 25),
      key: `${modeKey}-${index}`,
    }
  })

  return (
    <div className="mode-background" aria-hidden="true">
      {tiles.map(({ Icon, top, left, size, rotate, key }) => (
        <Icon
          key={key}
          className="mode-background-icon"
          style={{
            top,
            left,
            width: size,
            height: size,
            transform: `rotate(${rotate}deg)`,
          }}
          strokeWidth={1.25}
        />
      ))}
    </div>
  )
}
