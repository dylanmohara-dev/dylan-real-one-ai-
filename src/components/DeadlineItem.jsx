import { Check, Swords, FileText, X, ExternalLink } from 'lucide-react'
import { dateChipParts, deadlineLabel, classColorRgb } from '../lib/schoolDeadlines.js'

// One row of the "Coming up" deadline list -- shared by SchoolPage.jsx
// (the full dashboard) and OverviewPage.jsx (the Home-screen widget,
// session 40) so both are pixel-for-pixel the same real component instead
// of two hand-synced copies. Native assignments/tests AND Canvas-synced
// items are all real, checkable rows here -- Canvas items are local-only
// completions (see routes/canvasCompletions.js), never a write back to
// Canvas itself.
export default function DeadlineItem({
  item,
  celebrating,
  onComplete,
  onOpenClass,
  onDismiss,
  clickable = true,
}) {
  const tone = item.completed ? 'done' : item.daysUntil < 0 ? 'overdue' : item.daysUntil <= 2 ? 'soon' : 'normal'
  const isCanvas = item.kind === 'Canvas'
  const { month, day } = dateChipParts(item.dueDate)
  const pillKind = isCanvas ? 'canvas' : item.kind.toLowerCase()
  const pillLabel = isCanvas ? 'Canvas' : item.kind

  return (
    <div
      className={`deadline-item deadline-${tone}${clickable && !isCanvas ? ' deadline-clickable' : ''}${celebrating ? ' deadline-celebrating' : ''}`}
      style={item.classId ? { '--class-color-rgb': classColorRgb(item.classId) } : undefined}
      onClick={() => {
        if (!isCanvas && onOpenClass) onOpenClass()
      }}
    >
      <button
        className={`check-button${isCanvas ? ' check-button-canvas' : ''}${celebrating || item.completed ? ' check-button-done' : ''}`}
        onClick={(event) => {
          event.stopPropagation()
          if (!celebrating && !item.completed) onComplete()
        }}
        title={item.completed ? 'Done' : isCanvas ? 'Mark done (local only -- does not touch Canvas)' : 'Mark done'}
      >
        {(celebrating || item.completed) && <Check size={14} strokeWidth={3} />}
      </button>

      <div className="deadline-date-chip" aria-hidden="true">
        <span className="deadline-date-month">{month}</span>
        <span className="deadline-date-day">{day}</span>
      </div>

      <div className="deadline-body">
        <strong>{item.title}</strong>
        <span className="deadline-class">
          {item.className}
          {isCanvas ? ' · Synced from Canvas' : ''}
        </span>
      </div>

      <div className="deadline-right">
        <span className={`deadline-pill deadline-pill-${pillKind}`}>
          {item.kind === 'Test' && <Swords size={10} strokeWidth={2.5} />}
          {item.kind === 'Assignment' && !isCanvas && <FileText size={10} strokeWidth={2.5} />}
          {pillLabel}
        </span>
        {item.completed ? (
          <span className="deadline-when deadline-when-done">Done</span>
        ) : (
          <span className="deadline-when">{deadlineLabel(item.daysUntil, item.dueDate)}</span>
        )}
      </div>

      {item.completed && onDismiss && (
        <button
          type="button"
          className="deadline-dismiss"
          title="Remove now"
          onClick={(event) => {
            event.stopPropagation()
            onDismiss()
          }}
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      )}

      {isCanvas && (
        <button
          type="button"
          className="deadline-canvas-open"
          title="Open in Canvas"
          onClick={(event) => {
            event.stopPropagation()
            window.open(item.raw.url, '_blank', 'noopener')
          }}
        >
          <ExternalLink size={12} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}
