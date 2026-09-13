import { Trophy, Sparkles, CheckCircle2, Target, Dumbbell, TrendingDown } from 'lucide-react'

const ICONS = {
  levelup: Sparkles,
  badge: Trophy,
  task: CheckCircle2,
  goal: Target,
  pr: Dumbbell,
  alert: TrendingDown,
  info: Sparkles,
}

export default function GameToast({ toasts, dismissToast }) {
  if (!toasts || !toasts.length) return null

  return (
    <div className="game-toast-stack">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind] || ICONS.info
        return (
          <button
            key={toast.id}
            className={`game-toast game-toast-${toast.kind}`}
            onClick={() => dismissToast(toast.id)}
            title="Dismiss"
          >
            <span className="game-toast-icon">
              <Icon size={16} strokeWidth={2.5} />
            </span>
            <span className="game-toast-copy">
              <strong>{toast.title}</strong>
              <span>{toast.message}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
