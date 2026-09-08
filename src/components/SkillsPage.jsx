import { useState } from 'react'
import { Flame, Trophy, Award, X, Plus } from 'lucide-react'

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

function SkillCard({ skill, removeSkill, deleteSkillSession }) {
  const unit = skill.unit || 'reps'

  return (
    <div className="skill-card">
      <div className="skill-card-header">
        <div>
          <span className="skill-card-name">{skill.name}</span>
          <span className="skill-card-level">Level {skill.level}</span>
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
          <p className="skill-recent-empty">Nothing logged yet — just tell the AI what you practiced.</p>
        )}
      </div>
    </div>
  )
}

export default function SkillsPage({ skills, maxActiveSkills, saving, addSkill, removeSkill, deleteSkillSession }) {
  const emptySlots = Math.max(0, maxActiveSkills - skills.length)

  return (
    <div className="page skills-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">SKILLS MODE</span>
          <h1 className="serif">Skills</h1>
          <p>
            Track up to {maxActiveSkills} at once. Just tell the AI what you practiced — there's no form to fill in
            for logging.
          </p>
        </div>
      </div>

      <div className="skills-grid">
        {skills.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            removeSkill={removeSkill}
            deleteSkillSession={deleteSkillSession}
          />
        ))}
        {Array.from({ length: emptySlots }).map((_, index) => (
          <AddSkillCard key={`empty-${index}`} saving={saving} addSkill={addSkill} />
        ))}
      </div>
    </div>
  )
}
