import { test } from 'node:test'
import assert from 'node:assert/strict'
import { iCalendarDateKey } from '../lib/appleCalendar.js'

test('DATE-valued Apple Calendar entries retain their calendar date without timezone conversion', () => {
  assert.equal(iCalendarDateKey(new Date('2026-10-05T00:00:00.000Z')), '2026-10-05')
  assert.equal(iCalendarDateKey(new Date('2026-03-08T00:00:00.000Z')), '2026-03-08')
  assert.equal(iCalendarDateKey(null), null)
})
