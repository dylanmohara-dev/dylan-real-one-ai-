import { useState } from 'react'

// The shared "game feel" tap-to-select building block: an icon grid with a
// real press/settle animation and a satisfying confirm pulse, reused for
// Gym's equipment tags and Health's quick food log. `momentary` decides
// which mode it runs in --
//   - false (default): a persistent single-select, like tagging an
//     exercise's equipment. `selectedId` stays highlighted until changed.
//   - true: a fire-and-forget action, like logging a food -- there's no
//     lasting selection, just a brief pulse on whichever tile was just
//     tapped, then it resets so the same tile can be tapped again later.
export default function IconPickerGrid({ items, selectedId, onSelect, momentary = false }) {
  const [flashId, setFlashId] = useState(null)

  function handleClick(item) {
    onSelect(item)
    if (momentary) {
      setFlashId(item.id)
      window.setTimeout(() => {
        setFlashId((current) => (current === item.id ? null : current))
      }, 900)
    }
  }

  return (
    <div className="icon-picker-grid">
      {items.map((item) => {
        const Icon = item.icon
        const isActive = momentary ? flashId === item.id : selectedId === item.id
        return (
          <button
            type="button"
            key={item.id}
            className={`icon-picker-tile${isActive ? ' active' : ''}`}
            onClick={() => handleClick(item)}
          >
            <span className="icon-picker-tile-icon">
              <Icon size={20} strokeWidth={2.25} />
            </span>
            <span className="icon-picker-tile-label">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
