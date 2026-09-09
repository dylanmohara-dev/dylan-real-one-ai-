import { useState } from 'react'
import { Bed, Utensils, Droplets, Footprints } from 'lucide-react'
import ModeChatLauncher from './ModeChatLauncher.jsx'

const CATEGORY_META = {
  sleep: { label: 'Sleep', icon: Bed, placeholder: 'e.g. 7.5 hours' },
  food: { label: 'Food', icon: Utensils, placeholder: 'What did you eat?' },
  water: { label: 'Water', icon: Droplets, placeholder: 'e.g. 4 glasses' },
  activity: { label: 'Activity', icon: Footprints, placeholder: 'e.g. 30 min walk' },
}

function QuickLogForm({ category, saving, addHealthEntry }) {
  const meta = CATEGORY_META[category]
  const Icon = meta.icon
  const [value, setValue] = useState('')

  return (
    <div className="form-card health-log-card">
      <div className="health-log-label">
        <Icon size={16} strokeWidth={2.25} />
        {meta.label}
      </div>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && value.trim()) {
            addHealthEntry(category, value)
            setValue('')
          }
        }}
        placeholder={meta.placeholder}
      />
      <button
        onClick={() => {
          addHealthEntry(category, value)
          setValue('')
        }}
        disabled={saving || !value.trim()}
      >
        Log
      </button>
    </div>
  )
}

export default function HealthPage({ healthEntries, saving, addHealthEntry, deleteHealthEntry, assistantContext, openChat }) {
  const sorted = healthEntries.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  return (
    <div className="page health-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">HEALTH MODE</span>
          <h1 className="serif">Health</h1>
          <p>Sleep, food, drink, activity — log whatever you've got today.</p>
        </div>
      </div>

      <ModeChatLauncher assistantContext={assistantContext} modeKey="health" openChat={openChat} />

      <div className="health-log-grid">
        {Object.keys(CATEGORY_META).map((category) => (
          <QuickLogForm
            key={category}
            category={category}
            saving={saving}
            addHealthEntry={addHealthEntry}
          />
        ))}
      </div>

      <div className="items-list">
        {sorted.length ? (
          sorted.map((entry) => {
            const meta = CATEGORY_META[entry.category]
            const Icon = meta?.icon

            return (
              <div className="item-card" key={entry.id}>
                <div className="item-content">
                  <strong>
                    {Icon && <Icon size={14} strokeWidth={2.25} className="health-item-icon" />}
                    {meta?.label || entry.category}: {entry.value}
                  </strong>
                  <div className="item-meta">
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <button className="delete-button" onClick={() => deleteHealthEntry(entry.id)}>
                  ×
                </button>
              </div>
            )
          })
        ) : (
          <div className="empty-state">
            <div>♡</div>
            <h3>Nothing logged yet</h3>
            <p>Use the forms above to log your first entry.</p>
          </div>
        )}
      </div>
    </div>
  )
}
