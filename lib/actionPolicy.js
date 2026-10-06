// Server-owned policy for actions suggested or detected through chat.
// Never derive these decisions from fields on the action object.
const ACTION_POLICIES = Object.freeze({
  create_task: { policy: 'AUTO', risk: 'low' },
  create_note: { policy: 'AUTO', risk: 'low' },
  complete_task: { policy: 'AUTO', risk: 'low' },
  update_goal: { policy: 'AUTO', risk: 'low' },
  save_memory: { policy: 'AUTO', risk: 'low' },

  create_goal: { policy: 'CONFIRM', risk: 'medium' },
  log_health: { policy: 'CONFIRM', risk: 'medium' },
  log_skill_practice: { policy: 'CONFIRM', risk: 'medium' },
  log_sports_session: { policy: 'CONFIRM', risk: 'medium' },
  log_gym_set: { policy: 'CONFIRM', risk: 'medium' },
  complete_habit: { policy: 'CONFIRM', risk: 'medium' },
  set_budget: { policy: 'CONFIRM', risk: 'medium' },
  log_family_entry: { policy: 'CONFIRM', risk: 'medium' },
  log_reading_session: { policy: 'CONFIRM', risk: 'medium' },
  complete_assignment: { policy: 'CONFIRM', risk: 'medium' },

  delete_task: { policy: 'EXPLICIT', risk: 'high' },
  forget_memory: { policy: 'EXPLICIT', risk: 'high' },
  log_transaction: { policy: 'EXPLICIT', risk: 'critical' },
  create_event: { policy: 'EXPLICIT', risk: 'critical' },
})

export function getActionPolicy(actionType) {
  return ACTION_POLICIES[actionType]?.policy || 'BLOCK'
}

export function requiresConfirmation(actionType) {
  const policy = getActionPolicy(actionType)
  return policy === 'CONFIRM' || policy === 'EXPLICIT'
}

export function canAutoExecute(actionType) {
  return getActionPolicy(actionType) === 'AUTO'
}

export function getActionRisk(actionType) {
  return ACTION_POLICIES[actionType]?.risk || 'unknown'
}
