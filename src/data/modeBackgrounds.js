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
}
