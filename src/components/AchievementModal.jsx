import { Trophy, Sparkles, Dumbbell, Target, Flame, TrendingUp, CheckCircle2 } from 'lucide-react'

// Full-screen "New Achievement" unlock -- deliberately separate from
// GameToast's corner stack. Those are frequent and ambient (every task,
// every habit); this is reserved for the handful of moments that should
// actually stop you for a second: leveling up, a real gym PR, finishing a
// goal, a streak crossing a milestone, a big net-worth day. Auto-dismisses
// (see useAppData's achievementQueue effect) but is also click-to-dismiss
// for anyone who doesn't want to wait it out.
const ICONS = {
  levelup: Sparkles,
  pr: Dumbbell,
  goal: Target,
  milestone: Flame,
  finance: TrendingUp,
  task: CheckCircle2,
}

export default function AchievementModal({ achievement, onDismiss }) {
  if (!achievement) return null

  const Icon = ICONS[achievement.kind] || Trophy

  return (
    <div className="achievement-modal-backdrop" onClick={onDismiss}>
      <div
        className={`achievement-modal-card achievement-modal-${achievement.kind}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="achievement-modal-icon">
          <Icon size={40} strokeWidth={1.75} />
        </div>
        <div className="achievement-modal-eyebrow">Achievement Unlocked</div>
        <div className="achievement-modal-title">{achievement.title}</div>
        {achievement.subtitle && (
          <div className="achievement-modal-subtitle">{achievement.subtitle}</div>
        )}
        <button type="button" className="achievement-modal-dismiss" onClick={onDismiss}>
          Nice
        </button>
      </div>
    </div>
  )
}
