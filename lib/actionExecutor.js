import { randomUUID } from 'node:crypto'
import { executeAction } from './assistant.js'
import { canAutoExecute, getActionPolicy, getActionRisk } from './actionPolicy.js'

const PENDING_ACTION_TTL_MS = 30 * 60 * 1000
const pendingActions = new Map()

function removeExpiredPendingActions() {
  const now = Date.now()
  for (const [id, pending] of pendingActions) {
    if (pending.expiresAt <= now) pendingActions.delete(id)
  }
}

// Mandatory server-side boundary for every action arriving through chat.
// `execute` is injectable for isolated tests; production always uses the
// existing implementation in assistant.js.
export async function executeActionWithPolicy(action, {
  execute = executeAction,
  actionsEnabled = true,
  explicitlyRequested = false,
  authorized = false,
  executionContext = {},
} = {}) {
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
    return { status: 'none', performed: false, message: '' }
  }

  const actionType = action.type
  const policy = getActionPolicy(actionType)
  if (policy === 'BLOCK') {
    return {
      status: 'blocked',
      policy,
      risk: getActionRisk(actionType),
      performed: false,
      message: `That action is not supported: ${actionType}.`,
    }
  }

  if (!actionsEnabled) {
    return {
      status: 'blocked',
      policy,
      risk: getActionRisk(actionType),
      performed: false,
      message: 'AI Actions are turned off in Settings.',
    }
  }

  // `save_memory` is AUTO only for an explicit user request. In particular,
  // a model-generated action cannot authorize itself by claiming to be asked.
  if (actionType === 'save_memory' && !explicitlyRequested) {
    return {
      status: 'blocked',
      policy,
      risk: getActionRisk(actionType),
      performed: false,
      message: 'I only save a memory when you explicitly ask me to remember it.',
    }
  }

  if (!canAutoExecute(actionType) && !authorized) {
    // Drop model-provided risk fields from the returned proposal. The risk
    // shown here always comes from this module's server-owned map.
    const safeAction = Object.fromEntries(
      Object.entries(action).filter(([key]) => key !== 'risk' && key !== 'riskLevel')
    )
    removeExpiredPendingActions()
    const id = randomUUID()
    const pendingAction = {
      id,
      type: actionType,
      policy,
      risk: getActionRisk(actionType),
      action: structuredClone(safeAction),
      requiresExplicitAuthorization: policy === 'EXPLICIT',
    }
    pendingActions.set(id, {
      action: structuredClone(safeAction),
      policy,
      expiresAt: Date.now() + PENDING_ACTION_TTL_MS,
    })
    return {
      status: 'pending',
      policy,
      risk: pendingAction.risk,
      performed: false,
      message: policy === 'EXPLICIT'
        ? 'This action needs your explicit confirmation before it can be done.'
        : 'This action needs your confirmation before it can be done.',
      pendingAction,
    }
  }

  // update_goal is only an automatic progress update on an existing goal.
  // The legacy executor updates progress only; reject malformed requests.
  if (actionType === 'update_goal' && (!action.title?.trim() || action.progress === undefined)) {
    return {
      status: 'blocked',
      policy,
      risk: getActionRisk(actionType),
      performed: false,
      message: 'A goal name and progress value are required.',
    }
  }

  const result = await execute(action, executionContext)
  return {
    status: result.performed ? 'executed' : 'not_performed',
    policy,
    risk: getActionRisk(actionType),
    ...result,
  }
}

// A confirmation token refers to a server-held action snapshot. The client
// cannot modify the action or policy when it authorizes execution.
export async function confirmPendingAction(id, { execute = executeAction } = {}) {
  removeExpiredPendingActions()
  const pending = pendingActions.get(id)
  if (!pending) {
    return { status: 'expired', performed: false, message: 'This action proposal expired or was already handled. Ask again to create a new proposal.' }
  }

  // Consume before execution to prevent double clicks/replays. A failed
  // external write is not automatically retried because its outcome may be
  // uncertain.
  pendingActions.delete(id)
  return executeActionWithPolicy(pending.action, {
    execute,
    actionsEnabled: true,
    explicitlyRequested: false,
    authorized: true,
  })
}

export function cancelPendingAction(id) {
  return pendingActions.delete(id)
}
