import {
  BookOpen,
  Volleyball,
  Dumbbell,
  Activity,
  TrendingUp,
  Star,
  Columns3,
  CheckCircle2,
  Users,
} from 'lucide-react'

export const DEFAULT_SETTINGS = {
  aiActions: true,
  memorySuggestions: true,
  appearance: 'dark',
  userName: 'Dylan',
  signatureTransitions: true,
  enterAnimation: 'wipe',
  onboardingComplete: false,
  designSystem: 'minimal-glass',
  colorPalette: 'vivid',
}

// Global "skin" layer, independent of the 9 per-mode color themes above.
// A mode theme still controls accent color, glow color, and content
// texture; a design system controls how the whole app is built around that
// color — chrome font, corner sharpness, border weight, and an overlay
// texture. Selected in Settings; applied as an extra `design-{key}` class
// alongside the mode's `theme-{key}` class (see App.jsx's themeClass).
export const DESIGN_SYSTEMS = [
  {
    key: 'minimal-glass',
    name: 'Minimal Glass',
    tagline: "Today's look, your 9 mode colors",
    description: 'Glassmorphism, high legibility, nothing fighting for attention. The only option where School stays gold, Gym stays orange, etc. — every other option below has its own fixed color instead.',
  },
  {
    key: 'neon-arcade',
    name: 'Neon Arcade',
    tagline: 'Magenta + cyan, always',
    description: "Overrides every mode's color with the same hot magenta/cyan neon regardless of which life area you're in. Orbitron headings, a pulsing glow on the sidebar, a scanning grid behind everything.",
  },
  {
    key: 'command-deck',
    name: 'Command Deck',
    tagline: 'Cyan HUD, always',
    description: "Overrides every mode's color with cockpit cyan/blue. Monospace readouts, corners that are cut at an angle instead of rounded — not a subtle shape tweak, actual clipped panel geometry.",
  },
  {
    key: 'retro-terminal',
    name: 'Retro Terminal',
    tagline: 'Phosphor green, always',
    description: "Overrides every mode's color with classic phosphor green on near-black. Monospace everywhere, CRT scanlines, a blinking cursor after every page title.",
  },
  {
    key: 'comic-pop',
    name: 'Comic Pop',
    tagline: 'Comic red + yellow, always',
    description: "Overrides every mode's color with bold comic red/yellow. Thick black ink-line borders, halftone dots, heavy Anton headings, and buttons that bounce when you hover them.",
  },
]

// A third, independent global "skin" dimension: mood/intensity applied on
// top of whichever mode color and design system are active, via saturation/
// brightness/contrast multipliers (see the COLOR PALETTES section in
// App.css) rather than swapping hues — so it never fights the 9 mode colors
// or the 5 design systems, it just turns the whole thing up or down.
export const COLOR_PALETTES = [
  {
    key: 'vivid',
    name: 'Vivid',
    tagline: "Today's look",
    description: 'Full saturation, nothing dialed back. The default.',
  },
  {
    key: 'muted',
    name: 'Muted',
    tagline: 'Calmer, more professional',
    description: 'Desaturated across the board — colors are still there, just quieter.',
  },
  {
    key: 'rich',
    name: 'Rich',
    tagline: 'Deeper, more premium',
    description: 'Slightly more saturated and a touch darker, with extra contrast — colors feel heavier.',
  },
  {
    key: 'pastel',
    name: 'Pastel',
    tagline: 'Soft and light',
    description: 'Lower saturation, brighter, lower contrast — an airy, gentle version of every mode color.',
  },
  {
    key: 'high-contrast',
    name: 'High Contrast',
    tagline: 'Punchy and bold',
    description: 'Extra saturation and contrast pushed up — colors pop hard against the dark background.',
  },
]

export const ONBOARDING_PROMPTS = {
  school: "List your classes this term, and anything big due soon.",
  sports: 'What do you play, how often do you practice, and what are you working toward?',
  gym: "What's your routine or split look like right now?",
  health: 'Anything about sleep, food, water, or activity worth knowing?',
  finance: 'List any accounts you want tracked — checking, savings, credit cards — with rough balances.',
  skills: "What's the one skill you want to get better at?",
  reading: "What are you reading, and what's your daily page goal?",
  discipline: 'What daily habits do you want to hold yourself to?',
  family: 'Who\'s in your family, and what do you want to stay on top of?',
}

export const LIFE_MODES = [
  {
    key: 'school',
    assistantName: 'The Professor',
    assistantTitle: 'Academic strategist',
    icon: BookOpen,
    title: 'School',
    rgb: '244, 196, 48',
    rgb2: '255, 157, 58',
    headline: 'No classes yet',
    subtitle: 'Homework, projects, tests',
    metricLabel: 'COURSEWORK',
    metricValue: '0 / 0',
    assistantMessage:
      "Tell me about your classes, homework, and tests — I'll help you organize School.",
    prompts: ['Add a new class', "What's due this week?"],
  },
  {
    key: 'sports',
    assistantName: 'The Coach',
    assistantTitle: 'Performance coach',
    icon: Volleyball,
    title: 'Sports',
    rgb: '34, 197, 94',
    rgb2: '163, 230, 53',
    headline: 'No sessions logged',
    subtitle: 'Practice, games, film',
    metricLabel: 'WEEKLY HOURS',
    metricValue: '0H / 8H',
    assistantMessage:
      "Tell me about your practices and games — I'll help you track Sports.",
    prompts: ["Log today's practice", 'Plan my week of training'],
  },
  {
    key: 'gym',
    assistantName: 'The Trainer',
    assistantTitle: 'Strength coach',
    icon: Dumbbell,
    title: 'Gym',
    rgb: '249, 115, 22',
    rgb2: '239, 68, 68',
    headline: 'No workouts logged',
    subtitle: 'Schedule, type, weight per lift',
    metricLabel: 'SESSIONS',
    metricValue: '0 / 4',
    assistantMessage:
      "Tell me your split and schedule — I'll help you track Gym.",
    prompts: ['Log a workout', 'Build me a split'],
  },
  {
    key: 'health',
    assistantName: 'The Physician',
    assistantTitle: 'Wellness expert',
    icon: Activity,
    title: 'Health',
    rgb: '45, 212, 191',
    rgb2: '20, 184, 166',
    headline: 'Nothing logged today',
    subtitle: 'Sleep, food, drink, activity',
    metricLabel: 'DAILY LOG',
    metricValue: '0 / 4',
    assistantMessage:
      "Tell me about your sleep, food, and activity — I'll help you track Health.",
    prompts: ["Log today's sleep and meals", 'How am I doing this week?'],
  },
  {
    key: 'finance',
    assistantName: 'The Analyst',
    assistantTitle: 'Financial strategist',
    icon: TrendingUp,
    title: 'Finance',
    rgb: '59, 130, 246',
    rgb2: '14, 165, 233',
    headline: 'No positions yet',
    subtitle: 'Trading and net worth',
    metricLabel: 'NET WORTH GOAL',
    metricValue: '—',
    assistantMessage:
      "Tell me about your positions and goals — I'll help you track Finance.",
    prompts: ['Log a trade', 'Check my net worth goal'],
  },
  {
    key: 'skills',
    assistantName: 'The Mentor',
    assistantTitle: 'Skill acquisition expert',
    icon: Star,
    title: 'Skills',
    rgb: '168, 85, 247',
    rgb2: '139, 92, 246',
    headline: 'No skill chosen',
    subtitle: 'One focus, tracked daily',
    metricLabel: 'PRACTISED',
    metricValue: '0 / 30 MIN',
    assistantMessage:
      "Tell me the skill you want to focus on — I'll help you track it daily.",
    prompts: ['Pick a skill to focus on', "Log today's practice"],
  },
  {
    key: 'reading',
    assistantName: 'The Librarian',
    assistantTitle: 'Literary expert',
    icon: Columns3,
    title: 'Reading',
    rgb: '244, 63, 94',
    rgb2: '236, 72, 153',
    headline: '0 pages today',
    subtitle: 'Goal of 10 pages a day',
    metricLabel: 'PAGES',
    metricValue: '0 / 10',
    assistantMessage:
      "Tell me what you're reading — I'll help you track your pages.",
    prompts: ["Log today's pages", 'Recommend what to read next'],
  },
  {
    key: 'discipline',
    assistantName: 'The Enforcer',
    assistantTitle: 'Accountability expert',
    icon: CheckCircle2,
    title: 'Discipline',
    rgb: '239, 68, 68',
    rgb2: '220, 38, 38',
    headline: 'No habits set',
    subtitle: 'Daily checklist, every day',
    metricLabel: 'TODAY',
    metricValue: '0 / 0',
    assistantMessage:
      "Tell me the habits you want to build — I'll help you track Discipline.",
    prompts: ['Set up my daily habits', "Did I complete today's checklist?"],
  },
  {
    key: 'family',
    assistantName: 'The Anchor',
    assistantTitle: 'Family relationships expert',
    icon: Users,
    title: 'Family',
    rgb: '99, 102, 241',
    rgb2: '59, 130, 246',
    headline: 'No family added',
    subtitle: 'Check-ins and time together',
    metricLabel: 'TIME THIS WEEK',
    metricValue: '0H / 6H',
    assistantMessage:
      "Tell me about your family — I'll help you track check-ins and time together.",
    prompts: ['Add a family member', 'Plan a family check-in'],
  },
]

export const OVERVIEW_ASSISTANT_MESSAGE =
  "Nothing is tracked yet. Tell me what your week looks like and I'll set the modes up around it."
export const OVERVIEW_PROMPTS = [
  'Set up my school classes',
  'What should I focus on this week?',
]

export const WELCOME_GREETINGS = [
  (name) => `Welcome back, ${name}`,
  (name) => `What's up, ${name}?`,
  (name) => `What do you want to do, ${name}?`,
  (name) => `Good to see you, ${name}`,
  (name) => `Ready when you are, ${name}`,
  (name) => `Back at it, ${name}`,
]
