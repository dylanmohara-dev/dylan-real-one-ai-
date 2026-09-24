import { Egg, Drumstick, Beef, Fish, Salad, Sandwich, Soup, Pizza, Apple, Coffee, Milk, Cookie } from 'lucide-react'

// Quick-log presets for the food tab -- tap one to log it instantly instead
// of typing "what did you eat" every time. Doesn't replace the free-text
// entry (that's still there for anything not on this list), just removes
// the friction for the common cases so logging food is actually as fast
// as logging water/sleep already is.
export const QUICK_FOODS = [
  { id: 'eggs', label: 'Eggs', icon: Egg },
  { id: 'chicken', label: 'Chicken', icon: Drumstick },
  { id: 'beef', label: 'Beef', icon: Beef },
  { id: 'fish', label: 'Fish', icon: Fish },
  { id: 'salad', label: 'Salad', icon: Salad },
  { id: 'sandwich', label: 'Sandwich', icon: Sandwich },
  { id: 'soup', label: 'Soup/rice', icon: Soup },
  { id: 'pizza', label: 'Pizza', icon: Pizza },
  { id: 'fruit', label: 'Fruit', icon: Apple },
  { id: 'coffee', label: 'Coffee', icon: Coffee },
  { id: 'dairy', label: 'Dairy', icon: Milk },
  { id: 'snack', label: 'Snack', icon: Cookie },
]
