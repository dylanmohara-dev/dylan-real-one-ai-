import { MODE_BACKGROUND_ICONS, MODE_BACKGROUND_PATTERN } from '../data/modeBackgrounds.js'

// Deterministic pseudo-random generator so a mode's icon pattern is stable
// across re-renders instead of reshuffling every time state changes.
function createSeededRandom(seed) {
  let value = seed
  return () => {
    value = (value * 9301 + 49297) % 233280
    return value / 233280
  }
}

// The original "scattered watermark" layout — organic, unstructured.
// Used for the life areas that feel personal/soft rather than orderly.
function scatterTiles(icons, modeKey, random) {
  return Array.from({ length: 13 }, (_, index) => ({
    Icon: icons[index % icons.length],
    top: `${(random() * 110 - 5).toFixed(1)}%`,
    left: `${(random() * 110 - 5).toFixed(1)}%`,
    size: 56 + Math.round(random() * 64),
    rotate: Math.round(random() * 50 - 25),
    key: `${modeKey}-${index}`,
  }))
}

// Aligned rows and columns with light jitter — for the structured,
// orderly life areas (school, finance, mind, calendar).
function gridTiles(icons, modeKey, random) {
  const cols = 5
  const rows = 3
  const tiles = []
  let index = 0

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const jitter = (random() - 0.5) * 6
      tiles.push({
        Icon: icons[index % icons.length],
        top: `${((row / (rows - 1)) * 100 + jitter).toFixed(1)}%`,
        left: `${((col / (cols - 1)) * 100 + jitter).toFixed(1)}%`,
        size: 50 + Math.round(random() * 18),
        rotate: Math.round((random() - 0.5) * 8),
        key: `${modeKey}-${index}`,
      })
      index += 1
    }
  }

  return tiles
}

// Icons streaming along diagonal bands — for the energetic, in-motion
// life areas (sports, gym).
function diagonalTiles(icons, modeKey, random) {
  const bands = 4
  const perBand = 4
  const tiles = []
  let index = 0

  for (let band = 0; band < bands; band += 1) {
    const bandLeft = (band / (bands - 1)) * 130 - 15
    for (let i = 0; i < perBand; i += 1) {
      const t = i / (perBand - 1)
      tiles.push({
        Icon: icons[index % icons.length],
        top: `${(t * 130 - 15).toFixed(1)}%`,
        left: `${(bandLeft + (random() * 12 - 6)).toFixed(1)}%`,
        size: 48 + Math.round(random() * 48),
        rotate: -26,
        key: `${modeKey}-${index}`,
      })
      index += 1
    }
  }

  return tiles
}

const LAYOUTS = {
  grid: gridTiles,
  diagonal: diagonalTiles,
  scatter: scatterTiles,
}

export default function ModeBackground({ modeKey }) {
  const icons = MODE_BACKGROUND_ICONS[modeKey]

  if (!icons || !icons.length) return null

  const seed = Array.from(modeKey).reduce((acc, char) => acc + char.charCodeAt(0), 17)
  const random = createSeededRandom(seed)
  const layout = LAYOUTS[MODE_BACKGROUND_PATTERN[modeKey]] || scatterTiles
  const tiles = layout(icons, modeKey, random)

  return (
    <div className={`mode-background pattern-${MODE_BACKGROUND_PATTERN[modeKey] || 'scatter'}`} aria-hidden="true">
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
