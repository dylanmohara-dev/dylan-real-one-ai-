import { Trophy, Sparkles, Dumbbell, Target, Flame, TrendingUp, CheckCircle2 } from 'lucide-react'
import useCountUp from '../hooks/useCountUp.js'

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

// Confetti piece count for the level-up/rank-unlock variant only -- every
// other achievement kind keeps the plain card, this is deliberately the
// one moment that gets the extra weight (Dylan's "feel like Fortnite/GTA"
// ask was specifically about leveling up, not every toast-worthy event).
const CONFETTI_COUNT = 18

export default function AchievementModal({ achievement, onDismiss }) {
  // Hooks must run on every render regardless of whether `achievement` is
  // currently set -- all three below use optional chaining so they're
  // inert (no tally, no confetti) when it's null, same as before this
  // level-up upgrade existed.
  const isLevelUp = achievement?.kind === 'levelup'
  const hasTally = isLevelUp && typeof achievement?.xpGained === 'number' && achievement.xpGained > 0
  const tally = useCountUp(hasTally ? achievement.xpGained : 0, 900)

  if (!achievement) return null

  // Plain array, not memoized -- it's 18 integers, cheap to rebuild every
  // render, and each span below is keyed off achievement.id anyway so a
  // second level-up fired while this is still mounted gets fresh DOM
  // nodes (and therefore a replayed CSS animation) regardless.
  const confettiPieces = Array.from({ length: CONFETTI_COUNT }, (_, index) => index)

  const Icon = ICONS[achievement.kind] || Trophy
  const fillPercent =
    isLevelUp && achievement.xpForNextLevel
      ? Math.min(100, (achievement.xpIntoLevel / achievement.xpForNextLevel) * 100)
      : 0

  return (
    <div className={`achievement-modal-backdrop achievement-modal-backdrop-${achievement.kind}`} onClick={onDismiss}>
      <div
        className={`achievement-modal-card achievement-modal-${achievement.kind}${isLevelUp ? ' achievement-modal-card-big' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        {isLevelUp && (
          <div className="achievement-confetti" aria-hidden="true">
            {confettiPieces.map((index) => (
              <span
                key={`${achievement.id}-${index}`}
                style={{
                  '--confetti-angle': `${(index * 360) / CONFETTI_COUNT}deg`,
                  '--confetti-distance': `${92 + (index % 5) * 16}px`,
                  '--confetti-delay': `${(index % 4) * 30}ms`,
                  '--confetti-hue': `${(index * 47) % 360}deg`,
                }}
              />
            ))}
          </div>
        )}

        <div className="achievement-modal-icon">
          <Icon size={40} strokeWidth={1.75} />
        </div>
        <div className="achievement-modal-eyebrow">Achievement Unlocked</div>
        <div className={`achievement-modal-title${isLevelUp ? ' achievement-modal-title-big' : ''}`}>
          {achievement.title}
        </div>
        {achievement.subtitle && (
          <div className="achievement-modal-subtitle">{achievement.subtitle}</div>
        )}

        {hasTally && <div className="achievement-modal-tally">+{Math.round(tally)} XP</div>}

        {isLevelUp && achievement.xpForNextLevel ? (
          <div className="achievement-modal-xpbar">
            <span
              className="achievement-modal-xpbar-fill"
              style={{ '--xpbar-target': `${fillPercent}%` }}
            />
          </div>
        ) : null}

        <button type="button" className="achievement-modal-dismiss" onClick={onDismiss}>
          Nice
        </button>
      </div>
    </div>
  )
}
