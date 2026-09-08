import {
  BookOpen,
  GraduationCap,
  Volleyball,
  Trophy,
  Dumbbell,
  Flame,
  Bed,
  Utensils,
  Droplets,
  Footprints,
  TrendingUp,
  PiggyBank,
  Star,
  Lightbulb,
  Library,
  CheckCircle2,
  Target,
  Users,
  Heart,
  Moon,
  PenLine,
  CalendarClock,
  Clock,
} from 'lucide-react'

// Two or more icons per mode, tiled as a low-opacity watermark pattern so
// each mode has a background that visually matches what it's about,
// without needing external image assets.
export const MODE_BACKGROUND_ICONS = {
  school: [BookOpen, GraduationCap],
  sports: [Volleyball, Trophy],
  gym: [Dumbbell, Flame],
  health: [Bed, Utensils, Droplets, Footprints],
  finance: [TrendingUp, PiggyBank],
  skills: [Star, Lightbulb],
  reading: [Library, BookOpen],
  discipline: [CheckCircle2, Target],
  family: [Users, Heart],
  journal: [Moon, PenLine],
  calendar: [CalendarClock, Clock],
}

// How each mode's watermark is laid out — not just which icons, but the
// arrangement itself, so structured life areas actually look ordered and
// energetic ones look like they're in motion, rather than every mode being
// the same random scatter with different icons swapped in.
export const MODE_BACKGROUND_PATTERN = {
  school: 'grid',
  sports: 'diagonal',
  gym: 'diagonal',
  health: 'scatter',
  finance: 'grid',
  skills: 'scatter',
  reading: 'scatter',
  discipline: 'grid',
  family: 'scatter',
  journal: 'scatter',
  calendar: 'grid',
}
