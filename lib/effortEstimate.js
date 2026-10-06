export class EffortEstimateValidationError extends Error {
  constructor() {
    super('Estimated effort must be a positive whole number of minutes, or blank to clear it.')
    this.name = 'EffortEstimateValidationError'
  }
}

export function parseEstimatedEffortMinutes(value) {
  if (value === null || (typeof value === 'string' && value.trim() === '')) return null
  if (typeof value !== 'number' && typeof value !== 'string') throw new EffortEstimateValidationError()
  const minutes = typeof value === 'string' ? Number(value.trim()) : value
  if (!Number.isSafeInteger(minutes) || minutes <= 0) throw new EffortEstimateValidationError()
  return minutes
}

export function effortFieldsForCreate(body = {}) {
  if (!Object.hasOwn(body, 'estimatedEffortMinutes')) return {}
  const minutes = parseEstimatedEffortMinutes(body.estimatedEffortMinutes)
  return minutes === null ? {} : {
    estimatedEffortMinutes: minutes,
    estimatedEffortProvenance: 'user_recorded',
  }
}

export function effortFieldsForUpdate(body = {}) {
  const fields = { ...body }
  // Provenance is server-owned; callers can only provide the estimate value.
  delete fields.estimatedEffortProvenance
  if (!Object.hasOwn(body, 'estimatedEffortMinutes')) return { fields, clear: false }
  const minutes = parseEstimatedEffortMinutes(body.estimatedEffortMinutes)
  if (minutes === null) {
    delete fields.estimatedEffortMinutes
    return { fields, clear: true }
  }
  fields.estimatedEffortMinutes = minutes
  fields.estimatedEffortProvenance = 'user_recorded'
  return { fields, clear: false }
}
