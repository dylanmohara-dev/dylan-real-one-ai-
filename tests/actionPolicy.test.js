import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canAutoExecute,
  getActionPolicy,
  getActionRisk,
  requiresConfirmation,
} from '../lib/actionPolicy.js'
import { executeActionWithPolicy } from '../lib/actionExecutor.js'

const POLICY_MAP = {
  create_task: 'AUTO',
  create_note: 'AUTO',
  complete_task: 'AUTO',
  update_goal: 'AUTO',
  save_memory: 'AUTO',
  create_goal: 'CONFIRM',
  log_health: 'CONFIRM',
  log_skill_practice: 'CONFIRM',
  log_sports_session: 'CONFIRM',
  log_gym_set: 'CONFIRM',
  complete_habit: 'CONFIRM',
  set_budget: 'CONFIRM',
  log_family_entry: 'CONFIRM',
  log_reading_session: 'CONFIRM',
  complete_assignment: 'CONFIRM',
  delete_task: 'EXPLICIT',
  forget_memory: 'EXPLICIT',
  log_transaction: 'EXPLICIT',
  create_event: 'EXPLICIT',
}

test('the server policy explicitly classifies all 19 supported actions', () => {
  assert.equal(Object.keys(POLICY_MAP).length, 19)
  for (const [actionType, expected] of Object.entries(POLICY_MAP)) {
    assert.equal(getActionPolicy(actionType), expected, actionType)
    assert.equal(canAutoExecute(actionType), expected === 'AUTO', actionType)
    assert.equal(requiresConfirmation(actionType), expected !== 'AUTO', actionType)
    assert.notEqual(getActionRisk(actionType), 'unknown', actionType)
  }
})

test('AUTO action executes through the injected executor', async () => {
  const action = { type: 'create_task', title: 'Read' }
  let received
  const result = await executeActionWithPolicy(action, {
    execute: (value) => {
      received = value
      return { performed: true, message: 'Added task: Read' }
    },
  })

  assert.equal(received, action)
  assert.equal(result.status, 'executed')
  assert.equal(result.performed, true)
})

test('CONFIRM action is returned for confirmation without execution', async () => {
  let called = false
  const result = await executeActionWithPolicy({ type: 'log_health', category: 'sleep' }, {
    execute: () => { called = true; return { performed: true, message: '' } },
  })

  assert.equal(called, false)
  assert.equal(result.status, 'pending')
  assert.equal(result.pendingAction.policy, 'CONFIRM')
})

test('EXPLICIT action is returned for explicit authorization without execution', async () => {
  let called = false
  const result = await executeActionWithPolicy({ type: 'log_transaction', amount: 50 }, {
    execute: () => { called = true; return { performed: true, message: '' } },
  })

  assert.equal(called, false)
  assert.equal(result.status, 'pending')
  assert.equal(result.pendingAction.requiresExplicitAuthorization, true)
})

test('unknown action is blocked without execution', async () => {
  let called = false
  const result = await executeActionWithPolicy({ type: 'transfer_all_money' }, {
    execute: () => { called = true; return { performed: true, message: '' } },
  })

  assert.equal(called, false)
  assert.equal(result.status, 'blocked')
  assert.equal(result.policy, 'BLOCK')
})

test('model-supplied risk cannot lower a server policy', async () => {
  const result = await executeActionWithPolicy({
    type: 'log_transaction',
    amount: 50,
    risk: 'low',
    riskLevel: 'AUTO',
  })

  assert.equal(result.status, 'pending')
  assert.equal(result.risk, 'critical')
  assert.equal(result.pendingAction.risk, 'critical')
  assert.equal('risk' in result.pendingAction.action, false)
  assert.equal('riskLevel' in result.pendingAction.action, false)
})

test('normal non-action chat yields no action and invokes no executor', async () => {
  let called = false
  const result = await executeActionWithPolicy(null, {
    execute: () => { called = true; return { performed: true, message: '' } },
  })

  assert.equal(called, false)
  assert.equal(result.status, 'none')
  assert.equal(result.performed, false)
})

test('save_memory executes only when explicitly requested by the user', async () => {
  let calls = 0
  const execute = () => {
    calls += 1
    return { performed: true, message: 'Saved' }
  }
  const blocked = await executeActionWithPolicy({ type: 'save_memory', content: 'fact' }, { execute })
  assert.equal(blocked.status, 'blocked')
  assert.equal(calls, 0)

  const allowed = await executeActionWithPolicy({ type: 'save_memory', content: 'fact' }, {
    execute,
    explicitlyRequested: true,
  })
  assert.equal(allowed.status, 'executed')
  assert.equal(calls, 1)
})

test('aiActions off blocks even AUTO actions; on does not authorize CONFIRM actions', async () => {
  let calls = 0
  const execute = () => {
    calls += 1
    return { performed: true, message: 'done' }
  }
  assert.equal((await executeActionWithPolicy({ type: 'create_task' }, { execute, actionsEnabled: false })).status, 'blocked')
  const confirmResult = await executeActionWithPolicy({ type: 'log_health' }, { execute, actionsEnabled: true })
  assert.equal(confirmResult.status, 'pending')
  assert.equal(calls, 0)
})
