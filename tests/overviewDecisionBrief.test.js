import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const readSource = (relativePath) => fs.readFileSync(path.join(root, '..', relativePath), 'utf8')

test('both Overview render paths receive the server brief and existing daily focus signals', () => {
  const appSource = readSource('src/App.jsx')
  const overviewBranches = [...appSource.matchAll(/<OverviewPage[\s\S]*?\/>/g)].map(([branch]) => branch)

  assert.equal(overviewBranches.length, 2)
  for (const branch of overviewBranches) {
    assert.match(branch, /decisionBrief=\{data\.decisionBrief\}/)
    assert.match(branch, /dailyFocus=\{data\.dailyFocus\}/)
  }
})

test('Overview focus displays evidence and uncertainty without executing actions', () => {
  const overviewSource = readSource('src/components/OverviewPage.jsx')
  const component = overviewSource.split('function DecisionBriefFocus')[1].split('// Dylan\'s explicit ask')[0]

  assert.match(component, /AI recommendation/)
  assert.match(component, /candidate\.rankReasons/)
  assert.match(component, /candidate\.evidence/)
  assert.match(component, /Recorded fact/)
  assert.match(component, /uncertainties/)
  assert.match(component, /There isn’t enough current task or goal information/)
  assert.match(component, /setActivePage\(destination\)/)
  assert.doesNotMatch(component, /executeAction|addTask|completeTask|request\(/)
})

test('Today’s Focus remains visible when the decision brief request fails', () => {
  const overviewSource = readSource('src/components/OverviewPage.jsx')
  const component = overviewSource.split('function DecisionBriefFocus')[1].split('// Dylan\'s explicit ask')[0]

  assert.doesNotMatch(component, /if \(!brief\) return null/)
  assert.match(component, /The decision brief could not be loaded right now\./)
})

test('existing Overview widgets and mode cards remain in place', () => {
  const overviewSource = readSource('src/components/OverviewPage.jsx')

  assert.match(overviewSource, /<QuickActions/)
  assert.match(overviewSource, /<UpcomingSchoolWidget/)
  assert.match(overviewSource, /<DailyFocus/)
  assert.match(overviewSource, /overviewCards\.map/)
  assert.match(overviewSource, /function DecisionBriefFocus/)
})
