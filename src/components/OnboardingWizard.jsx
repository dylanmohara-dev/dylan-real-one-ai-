import { useState } from 'react'
import { ArrowRight, ArrowLeft, Sparkles } from 'lucide-react'
import { LIFE_MODES, ONBOARDING_PROMPTS } from '../data/lifeModes.js'

const STEPS = [
  { key: 'name', title: 'What should I call you?', kind: 'name' },
  ...LIFE_MODES.map((mode) => ({
    key: mode.key,
    title: `Tell me about ${mode.title}`,
    prompt: ONBOARDING_PROMPTS[mode.key],
    kind: 'mode',
    mode,
  })),
]

export default function OnboardingWizard({ onComplete }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [name, setName] = useState('')
  const [answers, setAnswers] = useState({})
  const [phase, setPhase] = useState('questions') // questions | submitting | done | error
  const [summary, setSummary] = useState(null)

  const step = STEPS[stepIndex]
  const isLastStep = stepIndex === STEPS.length - 1

  function goNext() {
    if (isLastStep) {
      submit()
    } else {
      setStepIndex((i) => i + 1)
    }
  }

  function goBack() {
    setStepIndex((i) => Math.max(0, i - 1))
  }

  // See useAppData.js's API constant for why this needs the DEV check --
  // onboarding only ever runs once, but a hardcoded localhost:3001 would
  // fail it outright for anyone opening this app for the first time
  // through a tunnel/phone instead of directly on this Mac.
  const ONBOARDING_API = import.meta.env.DEV ? 'http://localhost:3001/api/onboarding' : '/api/onboarding'

  async function submit() {
    setPhase('submitting')
    try {
      const response = await fetch(ONBOARDING_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, answers }),
      })
      const data = await response.json()
      setSummary(data.summary || null)
      setPhase('done')
    } catch {
      setPhase('error')
    }
  }

  function finish() {
    onComplete({ name: name.trim() })
  }

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-card">
        {phase === 'questions' && (
          <>
            <div className="onboarding-progress">
              <div
                className="onboarding-progress-fill"
                style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
              />
            </div>
            <span className="onboarding-step-count">
              {stepIndex + 1} / {STEPS.length}
            </span>

            <h1 className="serif">{step.title}</h1>

            {step.kind === 'name' ? (
              <input
                autoFocus
                className="onboarding-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Dylan"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && name.trim()) goNext()
                }}
              />
            ) : (
              <>
                <p className="onboarding-hint">{step.prompt}</p>
                <textarea
                  autoFocus
                  className="onboarding-textarea"
                  value={answers[step.key] || ''}
                  onChange={(event) =>
                    setAnswers((prev) => ({ ...prev, [step.key]: event.target.value }))
                  }
                  placeholder="Type as much or as little as you want..."
                />
              </>
            )}

            <div className="onboarding-actions">
              <button
                className="onboarding-back"
                onClick={goBack}
                disabled={stepIndex === 0}
              >
                <ArrowLeft size={14} strokeWidth={2.25} />
                Back
              </button>

              <div className="onboarding-actions-right">
                {step.kind === 'mode' && (
                  <button className="onboarding-skip" onClick={goNext}>
                    Skip
                  </button>
                )}

                <button
                  className="onboarding-next"
                  onClick={goNext}
                  disabled={step.kind === 'name' && !name.trim()}
                >
                  {isLastStep ? 'Build my app' : 'Next'}
                  <ArrowRight size={14} strokeWidth={2.25} />
                </button>
              </div>
            </div>
          </>
        )}

        {phase === 'submitting' && (
          <div className="onboarding-loading">
            <div className="onboarding-loading-icon">
              <Sparkles size={22} strokeWidth={2.25} />
            </div>
            <h2 className="serif">Setting up your app...</h2>
            <p>Reading through what you told me and getting things ready.</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="onboarding-loading">
            <div className="onboarding-loading-icon">
              <Sparkles size={22} strokeWidth={2.25} />
            </div>
            <h2 className="serif">You're set up{name.trim() ? `, ${name.trim()}` : ''}.</h2>
            <ul className="onboarding-summary">
              {summary?.classes > 0 && <li>{summary.classes} class{summary.classes === 1 ? '' : 'es'} added to School</li>}
              {summary?.healthEntries > 0 && <li>{summary.healthEntries} health entr{summary.healthEntries === 1 ? 'y' : 'ies'} logged</li>}
              {summary?.financeAccounts > 0 && <li>{summary.financeAccounts} finance account{summary.financeAccounts === 1 ? '' : 's'} added</li>}
              {summary?.memories > 0 && <li>{summary.memories} thing{summary.memories === 1 ? '' : 's'} saved to memory — Sports, Gym, Skills, Reading, Discipline, and Family don't have real trackers yet, so I kept what you told me and the AI already knows it</li>}
              {!summary && <li>Saved what I could — the local AI didn't respond, but nothing you typed was lost.</li>}
            </ul>
            <button className="onboarding-next" onClick={finish}>
              Enter Dylan AI
              <ArrowRight size={14} strokeWidth={2.25} />
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="onboarding-loading">
            <h2 className="serif">Couldn't reach the local AI.</h2>
            <p>Make sure your dev server and Ollama are running, then try again — or skip for now, nothing you typed is lost.</p>
            <div className="onboarding-actions-right">
              <button className="onboarding-skip" onClick={submit}>Try again</button>
              <button className="onboarding-next" onClick={finish}>Skip setup</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
