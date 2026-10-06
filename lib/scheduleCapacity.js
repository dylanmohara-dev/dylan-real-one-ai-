export const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
export const DEFAULT_WORK_AVAILABILITY = { weeklyWindows: [], dateOverrides: [] }
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function localTimeKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function localDayBounds(dateKey) {
  const match = DATE_RE.exec(dateKey || '')
  if (!match || !isValidDateKey(dateKey)) return null
  const [, year, month, day] = match.map(Number)
  const start = new Date(year, month - 1, day).getTime()
  const end = new Date(year, month - 1, day + 1).getTime()
  return { start, end }
}

export function addLocalDays(dateKey, amount) {
  const match = DATE_RE.exec(dateKey || '')
  if (!match || !isValidDateKey(dateKey)) return ''
  const [, year, month, day] = match.map(Number)
  return localDateKey(new Date(year, month - 1, day + amount, 12))
}

export function isValidDateKey(value) {
  const match = DATE_RE.exec(value || '')
  if (!match) return false
  const [, year, month, day] = match.map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function normalizeWindow(window, label) {
  if (!window || typeof window.id !== 'string' || !window.id.trim()) throw new Error(`${label} needs an id.`)
  if (!TIME_RE.test(window.startTime || '') || !TIME_RE.test(window.endTime || '')) {
    throw new Error(`${label} must use valid 24-hour start and end times.`)
  }
  if (window.startTime >= window.endTime) throw new Error(`${label} must end after it starts on the same day.`)
  return {
    id: window.id.trim(),
    startTime: window.startTime,
    endTime: window.endTime,
    enabled: window.enabled !== false,
  }
}

export function validateWorkAvailability(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Availability must be an object.')
  const weekly = Array.isArray(value.weeklyWindows) ? value.weeklyWindows : []
  const overrides = Array.isArray(value.dateOverrides) ? value.dateOverrides : []
  const weeklyWindows = weekly.map((window, index) => {
    const normalized = normalizeWindow(window, `Weekly window ${index + 1}`)
    const weekday = typeof window.weekday === 'string' ? window.weekday.toLowerCase() : ''
    if (!WEEKDAY_KEYS.includes(weekday)) throw new Error(`Weekly window ${index + 1} needs a valid weekday.`)
    return { ...normalized, weekday }
  })
  const seenDates = new Set()
  const dateOverrides = overrides.map((override, index) => {
    if (!override || typeof override.id !== 'string' || !override.id.trim() || !isValidDateKey(override.date)) {
      throw new Error(`Date override ${index + 1} needs an id and a valid date.`)
    }
    if (seenDates.has(override.date)) throw new Error(`Only one date override is allowed for ${override.date}.`)
    seenDates.add(override.date)
    const windows = Array.isArray(override.windows) ? override.windows : []
    return {
      id: override.id.trim(),
      date: override.date,
      enabled: override.enabled !== false,
      windows: windows.map((window, windowIndex) => normalizeWindow(window, `Date override ${index + 1}, window ${windowIndex + 1}`)),
    }
  })
  return { weeklyWindows, dateOverrides }
}

function mergeIntervals(intervals) {
  const sorted = intervals.filter((item) => item.end > item.start).sort((a, b) => a.start - b.start || a.end - b.end)
  const merged = []
  for (const interval of sorted) {
    const last = merged.at(-1)
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end)
    else merged.push({ start: interval.start, end: interval.end })
  }
  return merged
}

function intervalMinutes(intervals) {
  return Math.round(intervals.reduce((sum, interval) => sum + (interval.end - interval.start), 0) / 60000)
}

function localWindowInterval(dateKey, window) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const [startHour, startMinute] = window.startTime.split(':').map(Number)
  const [endHour, endMinute] = window.endTime.split(':').map(Number)
  const start = new Date(year, month - 1, day, startHour, startMinute)
  const end = new Date(year, month - 1, day, endHour, endMinute)
  // A local time inside the spring DST gap is normalized by Date. Do not
  // silently turn the user's declared interval into a different interval.
  const matches = (date, hour, minute) => date.getFullYear() === year && date.getMonth() === month - 1
    && date.getDate() === day && date.getHours() === hour && date.getMinutes() === minute
  if (!matches(start, startHour, startMinute) || !matches(end, endHour, endMinute)) return null
  // During fall-back, a wall-clock time can refer to two distinct instants.
  // Leave that declaration unresolved instead of guessing which one was meant.
  const isAmbiguous = (target, hour, minute) => {
    let matchesCount = 0
    for (let offset = -180; offset <= 180; offset += 1) {
      const candidate = new Date(target.getTime() + offset * 60000)
      if (matches(candidate, hour, minute)) matchesCount += 1
    }
    return matchesCount > 1
  }
  if (isAmbiguous(start, startHour, startMinute) || isAmbiguous(end, endHour, endMinute)) return null
  return { start: start.getTime(), end: end.getTime() }
}

function constraintInterval(item, dateKey, dayBounds) {
  if (item.allDay) return null
  let start = Number.isFinite(Date.parse(item.startAt || item.scheduledAt)) ? Date.parse(item.startAt || item.scheduledAt) : null
  let end = Number.isFinite(Date.parse(item.endAt)) ? Date.parse(item.endAt) : null
  if (start === null && item.localDate === dateKey && item.localStartTime && item.localEndTime) {
    const interval = localWindowInterval(dateKey, { startTime: item.localStartTime, endTime: item.localEndTime })
    if (!interval) return null
    start = interval.start
    end = interval.end
  }
  if (start === null || end === null || end <= start || end <= dayBounds.start || start >= dayBounds.end) return null
  return { start: Math.max(start, dayBounds.start), end: Math.min(end, dayBounds.end) }
}

function availabilityForDate(availability, dateKey) {
  const override = availability.dateOverrides.find((item) => item.date === dateKey && item.enabled)
  if (override) return { configured: true, windows: override.windows.filter((window) => window.enabled) }
  const date = new Date(`${dateKey}T12:00:00`)
  const weekday = WEEKDAY_KEYS[date.getDay()]
  const declared = availability.weeklyWindows.filter((window) => window.weekday === weekday)
  return { configured: declared.length > 0, windows: declared.filter((window) => window.enabled) }
}

export function availabilityIsConfigured(value) {
  return Boolean((value?.weeklyWindows?.length || 0) + (value?.dateOverrides?.length || 0))
}

/** Summarize known occupied intervals and explicitly declared work windows for one local date. */
export function calculateDailyCapacity({
  date,
  constraints = [],
  availability = DEFAULT_WORK_AVAILABILITY,
  calendarStatus = { state: 'unknown' },
  now = new Date(),
} = {}) {
  const dayBounds = localDayBounds(date)
  if (!dayBounds) throw new Error('A valid local date is required.')
  const config = validateWorkAvailability(availability || DEFAULT_WORK_AVAILABILITY)
  const dayAvailability = availabilityForDate(config, date)
  const configured = dayAvailability.configured
  const today = localDateKey(now)
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  const knownIntervals = []
  const seen = new Set()
  const dailyItems = []
  const appleEventsForDate = new Set()
  for (const item of constraints) {
    const identity = `${item.source || 'unknown'}:${item.occurrenceId || item.id || `${item.sourceId}:${item.title}:${item.localDate}:${item.localStartTime}`}`
    if (seen.has(identity)) continue
    seen.add(identity)
    if (item.source === 'apple_calendar' && item.localDate && item.localDate <= date
      && (!item.localEndDate || item.localEndDate > date)) appleEventsForDate.add(identity)
    const interval = constraintInterval(item, date, dayBounds)
    if (!interval) continue
    knownIntervals.push(interval)
    dailyItems.push({ item, ...interval })
  }
  const occupiedUnion = mergeIntervals(knownIntervals)
  const availabilityIntervals = configured
    ? dayAvailability.windows.map((window) => localWindowInterval(date, window)).filter(Boolean)
    : []
  const invalidAvailabilityWindowCount = configured
    ? dayAvailability.windows.length - availabilityIntervals.length
    : 0
  if (date === today && Number.isFinite(nowMs)) {
    for (const interval of availabilityIntervals) interval.start = Math.max(interval.start, nowMs)
  }
  const declaredWindows = mergeIntervals(availabilityIntervals)
  const occupiedInsideAvailability = mergeIntervals(occupiedUnion.flatMap((occupied) => declaredWindows
    .map((window) => ({ start: Math.max(occupied.start, window.start), end: Math.min(occupied.end, window.end) }))
    .filter((interval) => interval.end > interval.start)))
  const conflicts = []
  for (let i = 0; i < dailyItems.length; i += 1) {
    for (let j = i + 1; j < dailyItems.length; j += 1) {
      const a = dailyItems[i]
      const b = dailyItems[j]
      if (a.item.source === b.item.source && (a.item.occurrenceId || a.item.id) === (b.item.occurrenceId || b.item.id)) continue
      if (a.start < b.end && b.start < a.end) {
        conflicts.push({ first: a.item.title, second: b.item.title, start: Math.max(a.start, b.start), end: Math.min(a.end, b.end) })
      }
    }
  }
  const calendarState = calendarStatus?.state || 'unknown'
  const capacityKnown = configured && calendarState === 'available' && invalidAvailabilityWindowCount === 0
  const declaredWindowMinutes = configured ? intervalMinutes(declaredWindows) : null
  // Known occupied time remains a valid lower bound when calendar coverage is
  // incomplete. Capacity requires complete coverage and valid local windows.
  const occupiedMinutes = intervalMinutes(occupiedUnion)
  const occupiedInsideAvailabilityMinutes = calendarState === 'available' && configured && invalidAvailabilityWindowCount === 0
    ? intervalMinutes(occupiedInsideAvailability) : null
  const usableCapacityMinutes = capacityKnown
    ? Math.max(0, declaredWindowMinutes - occupiedInsideAvailabilityMinutes)
    : null
  return {
    date,
    calendarStatus: calendarState,
    calendarEventCount: calendarState === 'available' ? appleEventsForDate.size : null,
    availabilityStatus: configured ? 'configured' : 'not_configured',
    capacityStatus: capacityKnown ? 'calculated' : invalidAvailabilityWindowCount ? 'invalid_availability' : configured && calendarState === 'partial' ? 'schedule_incomplete' : configured && calendarState !== 'available' ? 'calendar_unavailable' : 'unknown',
    timedCommitmentCount: dailyItems.length,
    occupiedMinutes,
    declaredWindowMinutes,
    occupiedInsideAvailabilityMinutes,
    usableCapacityMinutes,
    conflicts,
    uncertainty: [
      ...(!configured ? ['Capacity unknown — no availability windows configured.'] : []),
      ...(configured && calendarState === 'disconnected' ? ['Calendar unavailable — Apple Calendar is not connected, so capacity is incomplete.'] : []),
      ...(configured && calendarState === 'unavailable' ? ['Calendar unavailable — its events could not be loaded, so capacity is incomplete.'] : []),
      ...(configured && calendarState === 'partial' ? ['Schedule data is incomplete, so capacity is unknown.'] : []),
      ...(configured && calendarState === 'unknown' ? ['Calendar status is unknown, so capacity is incomplete.'] : []),
      ...(invalidAvailabilityWindowCount ? ['A declared availability window has an invalid or ambiguous local time during a daylight-saving transition, so capacity is unknown for this date.'] : []),
    ],
  }
}

export function summarizeSchedule({ today = localDateKey(), days = 8, constraints = [], availability, calendarStatus, now = new Date() } = {}) {
  return Array.from({ length: days }, (_, index) => calculateDailyCapacity({
    date: addLocalDays(today, index), constraints, availability, calendarStatus, now,
  }))
}

/** Read-only occupied-time summary for the DecisionEngine when capacity is shelved. */
export function summarizeFixedSchedule({ today = localDateKey(), days = 8, constraints = [], calendarStatus, now = new Date() } = {}) {
  return summarizeSchedule({ today, days, constraints, availability: DEFAULT_WORK_AVAILABILITY, calendarStatus, now })
    .map(({ date, calendarStatus: sourceStatus, calendarEventCount, timedCommitmentCount, occupiedMinutes, conflicts, uncertainty }) => ({
      date,
      calendarStatus: sourceStatus,
      calendarEventCount,
      timedCommitmentCount,
      occupiedMinutes,
      conflicts,
      uncertainty: uncertainty.filter((item) => !item.includes('no availability windows configured')),
    }))
}
