import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_WORK_AVAILABILITY,
  calculateDailyCapacity,
  localDateKey,
  localDayBounds,
  validateWorkAvailability,
} from '../lib/scheduleCapacity.js'

const MONDAY = '2026-10-05'
const COMPLETE_CALENDAR = { source: 'apple_calendar', state: 'available', eventCount: 0 }

function window(id, startTime, endTime, weekday = 'monday') {
  return { id, weekday, startTime, endTime, enabled: true }
}

function configured(weeklyWindows, dateOverrides = []) {
  return { weeklyWindows, dateOverrides }
}

function event(id, startAt, endAt, extra = {}) {
  return {
    id,
    occurrenceId: id,
    source: 'apple_calendar',
    title: `Event ${id}`,
    scheduledDate: MONDAY,
    startAt,
    endAt,
    allDay: false,
    ...extra,
  }
}

test('calculates the merged union of non-overlapping, overlapping, nested, and adjacent intervals', () => {
  const constraints = [
    event('a', '2026-10-05T09:00:00-04:00', '2026-10-05T10:00:00-04:00'),
    event('b', '2026-10-05T09:30:00-04:00', '2026-10-05T11:00:00-04:00'),
    event('c', '2026-10-05T09:45:00-04:00', '2026-10-05T10:00:00-04:00'),
    event('d', '2026-10-05T11:00:00-04:00', '2026-10-05T11:30:00-04:00'),
    event('e', '2026-10-05T12:00:00-04:00', '2026-10-05T13:00:00-04:00'),
    event('all-day', '2026-10-05T00:00:00-04:00', '2026-10-06T00:00:00-04:00', { allDay: true }),
  ]
  const result = calculateDailyCapacity({ date: MONDAY, constraints, calendarStatus: COMPLETE_CALENDAR, now: new Date('2026-10-04T12:00:00-04:00') })
  assert.equal(result.occupiedMinutes, 210)
  assert.equal(result.timedCommitmentCount, 5)
  assert.equal(result.conflicts.length, 3)
})

test('duplicate occurrences with a stable identity are counted once', () => {
  const duplicate = event('stable-1', '2026-10-05T09:00:00-04:00', '2026-10-05T10:00:00-04:00')
  const result = calculateDailyCapacity({
    date: MONDAY,
    constraints: [duplicate, { ...duplicate }],
    calendarStatus: COMPLETE_CALENDAR,
    now: new Date('2026-10-04T12:00:00-04:00'),
  })
  assert.equal(result.occupiedMinutes, 60)
  assert.equal(result.timedCommitmentCount, 1)
  assert.deepEqual(result.conflicts, [])
})

test('subtracts only fixed commitments that intersect declared availability', () => {
  const availability = configured([window('weekly-1', '16:00', '20:00')])
  const constraints = [
    event('inside-1', '2026-10-05T16:30:00-04:00', '2026-10-05T17:30:00-04:00'),
    event('inside-2', '2026-10-05T18:30:00-04:00', '2026-10-05T19:00:00-04:00'),
    event('outside', '2026-10-05T12:00:00-04:00', '2026-10-05T15:00:00-04:00'),
  ]
  const result = calculateDailyCapacity({ date: MONDAY, availability, constraints, calendarStatus: COMPLETE_CALENDAR, now: new Date('2026-10-04T12:00:00-04:00') })
  assert.equal(result.declaredWindowMinutes, 240)
  assert.equal(result.occupiedInsideAvailabilityMinutes, 90)
  assert.equal(result.usableCapacityMinutes, 150)
  assert.equal(result.capacityStatus, 'calculated')
})

test('overlapping availability windows are unioned instead of double-counted', () => {
  const result = calculateDailyCapacity({
    date: MONDAY,
    availability: configured([window('one', '16:00', '18:00'), window('two', '17:00', '19:00')]),
    calendarStatus: COMPLETE_CALENDAR,
    now: new Date('2026-10-04T12:00:00-04:00'),
  })
  assert.equal(result.declaredWindowMinutes, 180)
  assert.equal(result.usableCapacityMinutes, 180)
})

test('date overrides replace weekday windows and support an explicitly empty day', () => {
  const base = configured(
    [window('weekly', '16:00', '20:00')],
    [{ id: 'override', date: MONDAY, enabled: true, windows: [{ id: 'override-window', startTime: '18:00', endTime: '19:30', enabled: true }] }],
  )
  const overridden = calculateDailyCapacity({ date: MONDAY, availability: base, calendarStatus: COMPLETE_CALENDAR, now: new Date('2026-10-04T12:00:00-04:00') })
  assert.equal(overridden.declaredWindowMinutes, 90)

  const noWindowOverride = calculateDailyCapacity({
    date: MONDAY,
    availability: configured([window('weekly', '16:00', '20:00')], [{ id: 'override', date: MONDAY, enabled: true, windows: [] }]),
    calendarStatus: COMPLETE_CALENDAR,
    now: new Date('2026-10-04T12:00:00-04:00'),
  })
  assert.equal(noWindowOverride.declaredWindowMinutes, 0)
  assert.equal(noWindowOverride.usableCapacityMinutes, 0)
})

test('disabled windows are excluded, while invalid windows are rejected', () => {
  const disabled = calculateDailyCapacity({
    date: MONDAY,
    availability: configured([{ ...window('disabled', '16:00', '20:00'), enabled: false }]),
    calendarStatus: COMPLETE_CALENDAR,
  })
  assert.equal(disabled.declaredWindowMinutes, 0)
  assert.throws(() => validateWorkAvailability(configured([window('invalid', '20:00', '16:00')])), /end after it starts/)
  assert.throws(() => validateWorkAvailability(configured([window('invalid', '16:75', '20:00')])), /valid 24-hour/)
})

test('no availability leaves capacity unknown, not zero', () => {
  const result = calculateDailyCapacity({ date: MONDAY, availability: DEFAULT_WORK_AVAILABILITY, calendarStatus: COMPLETE_CALENDAR })
  assert.equal(result.availabilityStatus, 'not_configured')
  assert.equal(result.capacityStatus, 'unknown')
  assert.equal(result.usableCapacityMinutes, null)
  assert.ok(result.uncertainty.some((line) => line.includes('no availability windows configured')))
})

test('a weekday with no declared window remains unknown while an explicit empty override means zero', () => {
  const mondayOnly = configured([window('monday', '16:00', '18:00')])
  const tuesday = calculateDailyCapacity({
    date: '2026-10-06',
    availability: mondayOnly,
    calendarStatus: COMPLETE_CALENDAR,
    now: new Date('2026-10-04T12:00:00-04:00'),
  })
  assert.equal(tuesday.availabilityStatus, 'not_configured')
  assert.equal(tuesday.capacityStatus, 'unknown')
  assert.equal(tuesday.usableCapacityMinutes, null)

  const explicitEmpty = calculateDailyCapacity({
    date: '2026-10-06',
    availability: configured([], [{ id: 'override-empty', date: '2026-10-06', enabled: true, windows: [] }]),
    calendarStatus: COMPLETE_CALENDAR,
    now: new Date('2026-10-04T12:00:00-04:00'),
  })
  assert.equal(explicitEmpty.availabilityStatus, 'configured')
  assert.equal(explicitEmpty.capacityStatus, 'calculated')
  assert.equal(explicitEmpty.usableCapacityMinutes, 0)
})

test('empty calendar, disconnected calendar, and failed calendar remain distinct', () => {
  const availability = configured([window('monday', '16:00', '18:00')])
  const empty = calculateDailyCapacity({ date: MONDAY, availability, calendarStatus: { state: 'available', eventCount: 0 }, constraints: [] })
  const disconnected = calculateDailyCapacity({ date: MONDAY, availability, calendarStatus: { state: 'disconnected', eventCount: null }, constraints: [] })
  const unavailable = calculateDailyCapacity({ date: MONDAY, availability, calendarStatus: { state: 'unavailable', eventCount: null }, constraints: [] })
  assert.equal(empty.calendarStatus, 'available')
  assert.equal(empty.calendarEventCount, 0)
  assert.equal(empty.usableCapacityMinutes, 120)
  assert.equal(disconnected.calendarStatus, 'disconnected')
  assert.equal(disconnected.occupiedMinutes, 0)
  assert.equal(disconnected.usableCapacityMinutes, null)
  assert.equal(disconnected.capacityStatus, 'calendar_unavailable')
  assert.equal(unavailable.calendarStatus, 'unavailable')
  assert.equal(unavailable.calendarEventCount, null)
  assert.equal(unavailable.usableCapacityMinutes, null)
})

test('known occupied intervals remain a lower bound when calendar coverage is incomplete', () => {
  const result = calculateDailyCapacity({
    date: MONDAY,
    availability: configured([window('monday', '16:00', '18:00')]),
    constraints: [event('known', '2026-10-05T16:00:00-04:00', '2026-10-05T16:30:00-04:00')],
    calendarStatus: { state: 'unavailable' },
  })
  assert.equal(result.occupiedMinutes, 30)
  assert.equal(result.usableCapacityMinutes, null)
})

test('timestamp local dates follow the host timezone across midnight and retain explicit offsets', () => {
  const originalTZ = process.env.TZ
  process.env.TZ = 'America/New_York'
  try {
    assert.equal(localDateKey('2026-10-06T01:30:00.000Z'), '2026-10-05')
    assert.equal(localDateKey('2026-10-06T04:00:00.000Z'), '2026-10-06')
    const result = calculateDailyCapacity({
      date: MONDAY,
      constraints: [event('offset', '2026-10-06T01:30:00.000Z', '2026-10-06T02:30:00.000Z')],
      calendarStatus: COMPLETE_CALENDAR,
    })
    assert.equal(result.occupiedMinutes, 60)
  } finally {
    if (originalTZ === undefined) delete process.env.TZ
    else process.env.TZ = originalTZ
  }
})

test('spring DST day uses local midnight bounds and nonexistent work windows keep capacity unknown', () => {
  const originalTZ = process.env.TZ
  process.env.TZ = 'America/New_York'
  try {
    const bounds = localDayBounds('2026-03-08')
    assert.equal((bounds.end - bounds.start) / 3600000, 23)
    const result = calculateDailyCapacity({
      date: '2026-03-08',
      availability: configured([{ id: 'dst-gap', weekday: 'sunday', startTime: '02:30', endTime: '03:30', enabled: true }]),
      calendarStatus: COMPLETE_CALENDAR,
    })
    assert.equal(result.capacityStatus, 'invalid_availability')
    assert.equal(result.usableCapacityMinutes, null)
    assert.ok(result.uncertainty.some((line) => line.includes('invalid or ambiguous local time')))
  } finally {
    if (originalTZ === undefined) delete process.env.TZ
    else process.env.TZ = originalTZ
  }
})

test('fall DST day uses local midnight bounds and ambiguous work windows keep capacity unknown', () => {
  const originalTZ = process.env.TZ
  process.env.TZ = 'America/New_York'
  try {
    const bounds = localDayBounds('2026-11-01')
    assert.equal((bounds.end - bounds.start) / 3600000, 25)
    const result = calculateDailyCapacity({
      date: '2026-11-01',
      availability: configured([{ id: 'dst-fold', weekday: 'sunday', startTime: '01:00', endTime: '02:00', enabled: true }]),
      calendarStatus: COMPLETE_CALENDAR,
    })
    assert.equal(result.capacityStatus, 'invalid_availability')
    assert.equal(result.usableCapacityMinutes, null)
  } finally {
    if (originalTZ === undefined) delete process.env.TZ
    else process.env.TZ = originalTZ
  }
})
