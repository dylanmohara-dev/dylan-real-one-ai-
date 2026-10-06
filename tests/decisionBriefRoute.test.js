import { test } from 'node:test'
import assert from 'node:assert/strict'
import bootstrapRouter from '../routes/bootstrap.js'

test('decision-brief route returns a bounded read-only brief with sourced candidate evidence', async () => {
  const layer = bootstrapRouter.stack.find((item) => item.route?.path === '/decision-brief')
  assert.ok(layer, 'decision-brief route is registered')
  const handler = layer.route.stack.find((item) => item.method === 'get')?.handle
  assert.equal(typeof handler, 'function')

  let statusCode = 200
  let result
  const response = {
    status(code) {
      statusCode = code
      return this
    },
    json(body) {
      result = body
      return this
    },
  }

  await handler({ app: { locals: {
    decisionCalendarEvents: [
      { id: 'test-event', title: 'Calendar block', start: '2030-05-10T12:00:00.000Z', end: '2030-05-10T13:00:00.000Z' },
    ],
    decisionCanvasAssignments: [],
  } } }, response)

  assert.equal(statusCode, 200)
  assert.ok(Array.isArray(result.candidates))
  assert.ok(result.candidates.length <= 5)
  assert.ok(Array.isArray(result.uncertainty))
  assert.equal(result.scheduleConstraints[0].title, 'Calendar block')
  for (const candidate of result.candidates) {
    assert.ok(Array.isArray(candidate.evidence))
    assert.ok(candidate.evidence.every((item) => item.source && item.provenance))
  }
})
