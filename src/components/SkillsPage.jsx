import { useState, useRef, useEffect } from 'react'
import { Flame, Trophy, Award, X, Plus, Video, Upload, Dumbbell, Target, TrendingUp, BookOpen, Zap, CheckCircle2 } from 'lucide-react'
import ModeChatLauncher from './ModeChatLauncher.jsx'
import HeroPhotoButton from './HeroPhotoButton.jsx'

// See useAppData.js's API constant for why this needs the DEV check --
// a hardcoded localhost:3001 would silently break every skill video's
// playback the moment this app is opened through a tunnel/phone instead
// of directly on this Mac.
const API = '/api'

function XPBar({ xpIntoLevel, xpForNextLevel }) {
  const percent = Math.max(0, Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100)))
  return (
    <div className="skill-xp-bar">
      <div className="skill-xp-bar-fill" style={{ width: `${percent}%` }} />
    </div>
  )
}

function AddSkillCard({ saving, addSkill }) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('reps')

  return (
    <div className="skill-card skill-card-empty">
      <div className="skill-card-empty-icon">
        <Plus size={20} strokeWidth={2.5} />
      </div>
      <h3>Add a skill</h3>
      <p>Give it a name and a unit — reps, pages, problems, whatever fits.</p>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="e.g. Guitar, Chess, Spanish"
      />
      <input
        value={unit}
        onChange={(event) => setUnit(event.target.value)}
        placeholder="Unit (default: reps)"
      />
      <button
        onClick={() => {
          addSkill(name, unit)
          setName('')
          setUnit('reps')
        }}
        disabled={saving || !name.trim()}
      >
        Start tracking
      </button>
    </div>
  )
}

function VideoUploader({ skillId, saving, uploadSkillVideo }) {
  const [label, setLabel] = useState('')
  const inputRef = useRef(null)

  return (
    <div className="skill-video-uploader">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="skill-video-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          uploadSkillVideo(skillId, file, label.trim())
          setLabel('')
          event.target.value = ''
        }}
      />
      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Label this clip (e.g. 'Backflip attempt #3')"
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={saving}
        title="Upload a video"
      >
        <Upload size={13} strokeWidth={2.25} />
        Add video
      </button>
    </div>
  )
}

function VideoGallery({ videos, deleteSkillVideo }) {
  if (!videos.length) return null

  return (
    <div className="skill-video-gallery">
      {videos.map((video) => (
        <div className="skill-video-item" key={video.id}>
          <video src={`${API}/skills/videos/${video.id}/file`} controls preload="metadata" />
          <div className="skill-video-item-footer">
            <span>{video.label}</span>
            <button onClick={() => deleteSkillVideo(video.id)} title="Delete video">
              <X size={12} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function LogPracticeForm({ skill, saving, addSkillSession }) {
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!quantity) return
    await addSkillSession(skill.id, quantity, note)
    setQuantity('')
    setNote('')
  }

  return (
    <form className="form-card skill-log-form" onSubmit={handleSubmit}>
      <input
        type="number"
        min="0"
        step="any"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        placeholder={`${skill.unit || 'reps'} today`}
      />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
      <button type="submit" disabled={saving || !quantity}>
        Log practice
      </button>
    </form>
  )
}

function SkillCard({ skill, saving, removeSkill, deleteSkillSession, uploadSkillVideo, deleteSkillVideo, addSkillSession }) {
  const unit = skill.unit || 'reps'

  return (
    <div className="skill-card">
      <div className="skill-card-header">
        <div>
          <span className="skill-card-name">{skill.name}</span>
          <span className="skill-card-level">
            Level {skill.level}
            <span className="skill-card-tier">{skill.tier}</span>
          </span>
        </div>
        <button className="skill-card-remove" onClick={() => removeSkill(skill.id)} title="Stop tracking this skill">
          <X size={13} strokeWidth={2.25} />
        </button>
      </div>

      <XPBar xpIntoLevel={skill.xpIntoLevel} xpForNextLevel={skill.xpForNextLevel} />
      <div className="skill-xp-label">
        {skill.xpIntoLevel} / {skill.xpForNextLevel} XP to level {skill.level + 1}
      </div>

      <div className="skill-card-stats">
        <div className="skill-stat">
          <Flame size={15} strokeWidth={2.25} className={skill.streak > 0 ? 'skill-stat-icon lit' : 'skill-stat-icon'} />
          <div>
            <strong>{skill.streak}</strong>
            <span>day streak</span>
          </div>
        </div>
        <div className="skill-stat">
          <Trophy size={15} strokeWidth={2.25} className="skill-stat-icon" />
          <div>
            <strong>{skill.maxStreak}</strong>
            <span>best streak</span>
          </div>
        </div>
        <div className="skill-stat">
          <div>
            <strong>{skill.todayQuantity}</strong>
            <span>{unit} today</span>
          </div>
        </div>
      </div>

      {skill.badges.length > 0 && (
        <div className="skill-badges">
          {skill.badges.map((badge) => (
            <span className="skill-badge" key={`${badge.type}-${badge.threshold}`}>
              <Award size={11} strokeWidth={2.25} />
              {badge.label}
            </span>
          ))}
        </div>
      )}

      {(skill.nextBadgeProgress?.streak || skill.nextBadgeProgress?.level) && (
        <div className="skill-badge-progress">
          {skill.nextBadgeProgress.streak && (
            <span>
              {skill.nextBadgeProgress.streak.remainingDays} more day
              {skill.nextBadgeProgress.streak.remainingDays === 1 ? '' : 's'} for a{' '}
              {skill.nextBadgeProgress.streak.threshold}-day streak badge
            </span>
          )}
          {skill.nextBadgeProgress.level && (
            <span>
              {skill.nextBadgeProgress.level.remainingXp} XP to a Level {skill.nextBadgeProgress.level.threshold} badge
            </span>
          )}
        </div>
      )}

      <div className="skill-video-section">
        <span className="skill-recent-heading">
          <Video size={11} strokeWidth={2.25} /> Proof of practice
        </span>
        <VideoGallery videos={skill.videos || []} deleteSkillVideo={deleteSkillVideo} />
        <VideoUploader skillId={skill.id} saving={saving} uploadSkillVideo={uploadSkillVideo} />
      </div>

      <LogPracticeForm skill={skill} saving={saving} addSkillSession={addSkillSession} />

      <div className="skill-recent">
        <span className="skill-recent-heading">Recent activity</span>
        {skill.sessions.length ? (
          skill.sessions.slice(0, 5).map((session) => (
            <div className="skill-recent-row" key={session.id}>
              <span>
                {session.quantity} {unit}
                {session.note ? ` — ${session.note}` : ''}
              </span>
              <button onClick={() => deleteSkillSession(session.id)} title="Delete entry">
                <X size={11} strokeWidth={2.25} />
              </button>
            </div>
          ))
        ) : (
          <p className="skill-recent-empty">Nothing logged yet -- log your first session above, or tell the AI what you practiced.</p>
        )}
      </div>
    </div>
  )
}

function TrainingGroundTab({ skills, saving, removeSkill, deleteSkillSession, uploadSkillVideo, deleteSkillVideo, addSkillSession, addSkill }) {
  return (
    <div className="skills-grid">
      {skills.map((skill) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          saving={saving}
          removeSkill={removeSkill}
          deleteSkillSession={deleteSkillSession}
          uploadSkillVideo={uploadSkillVideo}
          deleteSkillVideo={deleteSkillVideo}
          addSkillSession={addSkillSession}
        />
      ))}
      <AddSkillCard saving={saving} addSkill={addSkill} />
    </div>
  )
}

function QuestsTab({ quests, questsWeekEnd }) {
  if (!quests.length) {
    return (
      <div className="skill-quests-empty">
        Add at least one skill to start getting weekly quests.
      </div>
    )
  }

  return (
    <div className="skill-quests">
      <p className="skill-quests-sub">
        Resets {questsWeekEnd ? `after ${new Date(`${questsWeekEnd}T23:59:59`).toLocaleDateString(undefined, { weekday: 'long' })}` : 'weekly'} — complete one to bank bonus XP toward your overall level.
      </p>
      {quests.map((quest) => {
        const percent = Math.max(0, Math.min(100, Math.round((quest.progress / quest.target) * 100)))
        return (
          <div className={`skill-quest-card${quest.completed ? ' completed' : ''}`} key={quest.id}>
            <div className="skill-quest-top">
              <div className="skill-quest-title">
                {quest.completed ? <CheckCircle2 size={16} strokeWidth={2.25} /> : <Target size={16} strokeWidth={2.25} />}
                <strong>{quest.title}</strong>
              </div>
              <span className="skill-quest-bonus">+{quest.bonusXp} XP</span>
            </div>
            <p>{quest.description}</p>
            <div className="skill-xp-bar quest-bar">
              <div className="skill-xp-bar-fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="skill-quest-progress">
              {quest.progress} / {quest.target}
              {quest.completed ? ' — complete' : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Heatmap({ heatmap }) {
  if (!heatmap.length) return null
  const max = Math.max(1, ...heatmap.map((cell) => cell.xp))

  return (
    <div className="skill-heatmap">
      <div className="skill-heatmap-grid">
        {heatmap.map((cell) => {
          const intensity = cell.xp === 0 ? 0 : Math.max(0.18, Math.min(1, cell.xp / max))
          return (
            <div
              key={cell.date}
              className="skill-heatmap-cell"
              style={cell.xp > 0 ? { opacity: intensity } : undefined}
              title={`${cell.date}: ${cell.xp} XP`}
            />
          )
        })}
      </div>
      <div className="skill-heatmap-legend">
        <span>Less</span>
        <div className="skill-heatmap-cell" style={{ opacity: 0.18 }} />
        <div className="skill-heatmap-cell" style={{ opacity: 0.5 }} />
        <div className="skill-heatmap-cell" style={{ opacity: 1 }} />
        <span>More</span>
      </div>
    </div>
  )
}

function MasteryTab({ skills, heatmap, totalXp }) {
  const sorted = [...skills].sort((a, b) => b.xp - a.xp)
  const topTier = sorted[0]?.tier || 'Novice'

  return (
    <div className="skill-mastery">
      <div className="skill-mastery-summary">
        <div className="skill-mastery-stat">
          <Zap size={16} strokeWidth={2.25} />
          <div>
            <strong>{totalXp.toLocaleString()}</strong>
            <span>total XP earned</span>
          </div>
        </div>
        <div className="skill-mastery-stat">
          <Trophy size={16} strokeWidth={2.25} />
          <div>
            <strong>{topTier}</strong>
            <span>highest rank</span>
          </div>
        </div>
        <div className="skill-mastery-stat">
          <Dumbbell size={16} strokeWidth={2.25} />
          <div>
            <strong>{skills.length}</strong>
            <span>{skills.length === 1 ? 'skill' : 'skills'} in training</span>
          </div>
        </div>
      </div>

      <h3 className="skill-mastery-heading">Consistency (last 12 weeks)</h3>
      <Heatmap heatmap={heatmap} />

      <h3 className="skill-mastery-heading">Rank by skill</h3>
      <div className="skill-mastery-list">
        {sorted.map((skill) => (
          <div className="skill-mastery-row" key={skill.id}>
            <span className="skill-mastery-row-name">{skill.name}</span>
            <span className="skill-mastery-row-tier">{skill.tier}</span>
            <span className="skill-mastery-row-level">Lv {skill.level}</span>
            <span className="skill-mastery-row-xp">{(skill.xp || 0).toLocaleString()} XP</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function JournalTab({ fetchSkillJournal }) {
  const [sessions, setSessions] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchSkillJournal().then((data) => {
      if (!cancelled) {
        setSessions(data)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [fetchSkillJournal])

  if (loading) return <p className="skill-journal-empty">Loading practice history...</p>
  if (!sessions?.length) {
    return <p className="skill-journal-empty">Nothing logged yet across any skill -- log your first session on the Training Ground tab.</p>
  }

  return (
    <div className="skill-journal">
      {sessions.map((session) => (
        <div className="skill-journal-row" key={session.id}>
          <span className="skill-journal-date">{session.date}</span>
          <span className="skill-journal-skill">{session.skillName}</span>
          <span className="skill-journal-quantity">
            {session.quantity} {session.unit}
          </span>
          {session.note && <span className="skill-journal-note">{session.note}</span>}
        </div>
      ))}
    </div>
  )
}

const TABS = [
  { key: 'training', label: 'Training Ground', icon: Dumbbell },
  { key: 'quests', label: 'Quests', icon: Target },
  { key: 'mastery', label: 'Mastery', icon: TrendingUp },
  { key: 'journal', label: 'Journal', icon: BookOpen },
]

export default function SkillsPage({
  heroImages,
  updateHeroImage,
  resetHeroImage,
  skills,
  skillsMeta,
  fetchSkillJournal,
  saving,
  addSkill,
  addSkillSession,
  removeSkill,
  deleteSkillSession,
  uploadSkillVideo,
  deleteSkillVideo,
  assistantContext,
  openChat,
}) {
  const [activeTab, setActiveTab] = useState('training')
  const meta = skillsMeta || { quests: [], questsWeekEnd: null, totalXp: 0, heatmap: [] }

  return (
    <div className="page skills-page">
      <div
        className={`page-header${heroImages?.skills ? ' mode-hero' : ''}`}
        style={heroImages?.skills ? { '--hero-photo': `url(${heroImages.skills})` } : undefined}
      >
        <HeroPhotoButton
          modeKey="skills"
          heroUrl={heroImages?.skills}
          onChange={updateHeroImage}
          onReset={resetHeroImage}
        />
        <div>
          <span className="eyebrow">SKILLS MODE</span>
          <h1 className="serif">Skills</h1>
          <p>Track as many as you want. Just tell the AI what you practiced — there's no form to fill in for logging.</p>
        </div>
      </div>

      <ModeChatLauncher assistantContext={assistantContext} modeKey="skills" openChat={openChat} />

      <div className="finance-body skills-body">
        <nav className="finance-nav">
          {TABS.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                className={activeTab === item.key ? 'active' : ''}
                onClick={() => setActiveTab(item.key)}
              >
                <Icon size={16} strokeWidth={2.2} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="finance-content">
          {activeTab === 'training' && (
            <TrainingGroundTab
              skills={skills}
              saving={saving}
              removeSkill={removeSkill}
              deleteSkillSession={deleteSkillSession}
              uploadSkillVideo={uploadSkillVideo}
              deleteSkillVideo={deleteSkillVideo}
              addSkillSession={addSkillSession}
              addSkill={addSkill}
            />
          )}
          {activeTab === 'quests' && <QuestsTab quests={meta.quests} questsWeekEnd={meta.questsWeekEnd} />}
          {activeTab === 'mastery' && <MasteryTab skills={skills} heatmap={meta.heatmap} totalXp={meta.totalXp} />}
          {activeTab === 'journal' && <JournalTab fetchSkillJournal={fetchSkillJournal} />}
        </div>
      </div>
    </div>
  )
}
