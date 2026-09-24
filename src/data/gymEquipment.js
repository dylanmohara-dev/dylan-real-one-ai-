import { Dumbbell, Weight, Cog, PersonStanding, Waves, HeartPulse } from 'lucide-react'

// A deliberately small, bounded set -- enough to visually tell exercises
// apart at a glance without turning "add an exercise" into a 40-option
// catalog. Tap one when adding/editing an exercise; its icon then replaces
// the generic dumbbell everywhere that exercise shows up.
export const EQUIPMENT_TYPES = [
  { id: 'dumbbell', label: 'Dumbbell', icon: Dumbbell },
  { id: 'barbell', label: 'Barbell', icon: Weight },
  { id: 'machine', label: 'Machine', icon: Cog },
  { id: 'bodyweight', label: 'Bodyweight', icon: PersonStanding },
  { id: 'bands', label: 'Bands', icon: Waves },
  { id: 'cardio', label: 'Cardio', icon: HeartPulse },
]

export function equipmentMeta(id) {
  return EQUIPMENT_TYPES.find((item) => item.id === id) || null
}

export function equipmentIcon(id) {
  return equipmentMeta(id)?.icon || Dumbbell
}
