import { useState } from 'react'
import ModeChatLauncher from './ModeChatLauncher.jsx'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgoKey(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function AddMemberForm({ saving, addFamilyMember }) {
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!name.trim()) return
    await addFamilyMember(name, relationship)
    setName('')
    setRelationship('')
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label htmlFor="family-name-input">Name</label>
      <input id="family-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mom" />
      <label htmlFor="family-relationship-input">Relationship</label>
      <input
        id="family-relationship-input"
        value={relationship}
        onChange={(e) => setRelationship(e.target.value)}
        placeholder="Optional"
      />
      <button type="submit" disabled={saving || !name.trim()}>
        Add family member
      </button>
    </form>
  )
}

function LogCheckInForm({ members, saving, addFamilyLog }) {
  const [memberId, setMemberId] = useState(members[0]?.id || '')
  const [minutesSpent, setMinutesSpent] = useState('')
  const [note, setNote] = useState('')

  if (members.length === 0) {
    return (
      <div className="empty-state">
        <div>&#128101;</div>
        <h3>No family members added yet</h3>
        <p>Add someone in the People tab first.</p>
      </div>
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!memberId) return
    await addFamilyLog({ type: 'checkin', date: todayKey(), memberId, minutesSpent, note })
    setMinutesSpent('')
    setNote('')
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label htmlFor="family-member-select">Who</label>
      <select id="family-member-select" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <label htmlFor="family-minutes-input">Minutes together</label>
      <input
        id="family-minutes-input"
        type="number"
        min="0"
        value={minutesSpent}
        onChange={(e) => setMinutesSpent(e.target.value)}
        placeholder="e.g. 30"
      />
      <textarea placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      <button type="submit" disabled={saving}>
        Log check-in
      </button>
    </form>
  )
}

function LogFaithForm({ saving, addFamilyLog }) {
  const [note, setNote] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    await addFamilyLog({ type: 'faith', date: todayKey(), note })
    setNote('')
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <label htmlFor="family-faith-input">Today's faith practice</label>
      <textarea
        id="family-faith-input"
        placeholder="Prayer, reading, church, reflection -- whatever it was today"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />
      <button type="submit" disabled={saving}>
        Log it
      </button>
    </form>
  )
}

export default function FamilyPage({
  familyMembers,
  familyLog,
  saving,
  addFamilyMember,
  deleteFamilyMember,
  addFamilyLog,
  deleteFamilyLogEntry,
  assistantContext,
  openChat,
}) {
  const [activeTab, setActiveTab] = useState('today')
  const memberName = (id) => familyMembers.find((m) => m.id === id)?.name || 'Someone'
  const weekMinutes = familyLog
    .filter((e) => e.type === 'checkin' && e.date >= daysAgoKey(6) && e.date <= todayKey())
    .reduce((sum, e) => sum + (Number(e.minutesSpent) || 0), 0)
  const recentLog = familyLog
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : new Date(b.createdAt) - new Date(a.createdAt)))
    .slice(0, 20)

  return (
    <div className="page family-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">FAMILY/FAITH MODE</span>
          <h1 className="serif">Family/Faith</h1>
          <p>Check-ins, time together, and whatever faith practice matters to you.</p>
        </div>
      </div>

      <ModeChatLauncher assistantContext={assistantContext} modeKey="family" openChat={openChat} />

      <div className="gym-stats-row">
        <div className="gym-stat-card">
          <span className="gym-stat-label">TIME THIS WEEK</span>
          <span className="gym-stat-value">
            {Math.round((weekMinutes / 60) * 10) / 10}H / 6H
          </span>
        </div>
      </div>

      <div className="gym-tabs">
        <button type="button" className={activeTab === 'today' ? 'active' : ''} onClick={() => setActiveTab('today')}>
          Today
        </button>
        <button type="button" className={activeTab === 'people' ? 'active' : ''} onClick={() => setActiveTab('people')}>
          People
        </button>
        <button type="button" className={activeTab === 'faith' ? 'active' : ''} onClick={() => setActiveTab('faith')}>
          Faith
        </button>
      </div>

      {activeTab === 'today' && (
        <>
          <LogCheckInForm members={familyMembers} saving={saving} addFamilyLog={addFamilyLog} />
          <div className="items-list">
            {recentLog.length === 0 && (
              <div className="empty-state">
                <div>&#128172;</div>
                <h3>Nothing logged yet</h3>
                <p>Log a check-in above to get started.</p>
              </div>
            )}
            {recentLog.map((entry) => (
              <div className="item-card" key={entry.id}>
                <div className="item-content">
                  <strong>
                    {entry.date}: {entry.type === 'checkin' ? `Time with ${memberName(entry.memberId)}` : 'Faith practice'}
                    {entry.type === 'checkin' && entry.minutesSpent ? ` (${entry.minutesSpent} min)` : ''}
                  </strong>
                  {entry.note && (
                    <div className="item-meta">
                      <span>{entry.note}</span>
                    </div>
                  )}
                </div>
                <button className="delete-button" onClick={() => deleteFamilyLogEntry(entry.id)}>
                  &times;
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'people' && (
        <>
          <AddMemberForm saving={saving} addFamilyMember={addFamilyMember} />
          <div className="items-list">
            {familyMembers.length === 0 && (
              <div className="empty-state">
                <div>&#128101;</div>
                <h3>No family added</h3>
                <p>Add your first family member above.</p>
              </div>
            )}
            {familyMembers.map((member) => (
              <div className="item-card" key={member.id}>
                <div className="item-content">
                  <strong>{member.name}</strong>
                  {member.relationship && (
                    <div className="item-meta">
                      <span>{member.relationship}</span>
                    </div>
                  )}
                  {member.lastCheckIn && (
                    <div className="item-meta">
                      <span>Last check-in: {member.lastCheckIn}</span>
                    </div>
                  )}
                </div>
                <button className="delete-button" onClick={() => deleteFamilyMember(member.id)} aria-label={`Remove ${member.name}`}>
                  &times;
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'faith' && (
        <>
          <LogFaithForm saving={saving} addFamilyLog={addFamilyLog} />
          <div className="items-list">
            {familyLog.filter((e) => e.type === 'faith').length === 0 && (
              <div className="empty-state">
                <div>&#128591;</div>
                <h3>Nothing logged yet</h3>
                <p>Log today's faith practice above.</p>
              </div>
            )}
            {familyLog
              .filter((e) => e.type === 'faith')
              .slice()
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((entry) => (
                <div className="item-card" key={entry.id}>
                  <div className="item-content">
                    <strong>{entry.date}</strong>
                    {entry.note && (
                      <div className="item-meta">
                        <span>{entry.note}</span>
                      </div>
                    )}
                  </div>
                  <button className="delete-button" onClick={() => deleteFamilyLogEntry(entry.id)}>
                    &times;
                  </button>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}
