import { isConnected, listEventsInRange } from './appleCalendar.js'
import { addLocalDays, localDateKey, localDayBounds } from './scheduleCapacity.js'

/** Read a complete local-day schedule horizon from Apple Calendar without writing to it. */
export async function getCalendarScheduleSource({ now = new Date(), days = 7 } = {}) {
  if (!isConnected()) {
    return { events: [], status: { source: 'apple_calendar', state: 'disconnected', eventCount: null } }
  }
  const today = localDateKey(now)
  const start = localDayBounds(today)
  const afterHorizon = localDayBounds(addLocalDays(today, days + 1))
  if (!start || !afterHorizon) {
    return { events: [], status: { source: 'apple_calendar', state: 'unavailable', eventCount: null, reason: 'invalid local date' } }
  }
  try {
    const events = await listEventsInRange({
      start: new Date(start.start),
      end: new Date(afterHorizon.start),
      failOnCalendarError: true,
    })
    return { events, status: { source: 'apple_calendar', state: 'available', eventCount: events.length } }
  } catch (error) {
    return { events: [], status: { source: 'apple_calendar', state: 'unavailable', eventCount: null, reason: error?.message || 'calendar request failed' } }
  }
}
