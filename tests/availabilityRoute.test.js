import { test } from 'node:test'
import assert from 'node:assert/strict'
import availabilityRouter from '../routes/availability.js'
import bootstrapRouter from '../routes/bootstrap.js'

test('GET /api/availability returns stored availability or the unknown empty default without writing', () => {
  const layer = availabilityRouter.stack.find((item) => item.route?.path === '/')
  assert.ok(layer, 'availability route is registered')
  const handler = layer.route.stack.find((item) => item.method === 'get')?.handle
  assert.equal(typeof handler, 'function')

  let result
  let statusCode = 200
  const response = {
    status(code) { statusCode = code; return this },
    json(body) { result = body; return this },
  }
  handler({}, response)
  assert.equal(statusCode, 200)
  assert.ok(result.availability)
  assert.ok(Array.isArray(result.availability.weeklyWindows))
  assert.ok(Array.isArray(result.availability.dateOverrides))
  assert.equal(Object.hasOwn(result.availability, 'availableMinutes'), false)
})

test('the in-process bootstrap payload exposes availability for useAppData', () => {
  const layer = bootstrapRouter.stack.find((item) => item.route?.path === '/bootstrap')
  assert.ok(layer, 'bootstrap route is registered')
  const handler = layer.route.stack.find((item) => item.method === 'get')?.handle
  assert.equal(typeof handler, 'function')
  let result
  let statusCode = 200
  const response = {
    status(code) { statusCode = code; return this },
    json(body) { result = body; return this },
  }
  handler({}, response)
  assert.equal(statusCode, 200)
  assert.ok(result.workAvailability)
  assert.ok(Array.isArray(result.workAvailability.weeklyWindows))
  assert.ok(Array.isArray(result.workAvailability.dateOverrides))
})
