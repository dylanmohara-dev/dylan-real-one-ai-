import FootballIcon from '../components/FootballIcon.jsx'
import {
  BookOpen,
  Dumbbell,
  Activity,
  TrendingUp,
  Star,
  Columns3,
  Brain,
  Users,
} from 'lucide-react'

export const DEFAULT_SETTINGS = {
  aiActions: true,
  memorySuggestions: true,
  appearance: 'dark',
  userName: 'Dylan',
  // A full-screen color-flash splash on every single navigation read as a
  // game loading screen, not professional software -- 'wipe' and 'fade'
  // both still exist and work exactly as before for anyone who wants them
  // (Settings -> Display -> Enter Animation). 'zoom' (the new default,
  // session 37) is a different animal from those two: it's contained to
  // the content pane only -- the sidebar stays put and visible the whole
  // time -- and grows out of whichever nav icon was clicked (see
  // ZoomTransition.jsx + App.css's ZOOM TRANSITION section), so it reads
  // as a real app switching context rather than a loading-screen flash.
  signatureTransitions: true,
  enterAnimation: 'zoom',
  onboardingComplete: false,
  // Switched to 'neon-arcade' (from 'minimal-glass') per Dylan's explicit
  // choice when asked directly: keep the clean look, or actually switch
  // the whole app's visual style to match the GTA/videogame feel he's
  // been asking for across every other round. He picked switching.
  designSystem: 'neon-arcade',
  // 'rich' -- deeper, more saturated tones -- picked explicitly to pair
  // with the neon-arcade design system switch (was 'vivid').
  colorPalette: 'rich',
  // 'subtle' | 'normal' | 'flashy' -- scales duration/scale of the
  // celebration-layer animations (toasts, mode flash, achievement unlocks).
  // Separate from Transitions/Enter Animation above, which only control
  // the full-screen navigation flash.
  // 'flashy' -- picked explicitly to match the arcade direction
  // (was 'normal') -- bigger/longer toasts, achievement pop-ups, and
  // celebration effects app-wide.
  animationIntensity: 'flashy',
  // 'off' | 'slow' | 'normal' | 'fast' -- speed of the ambient Ken Burns
  // drift on each life area's full-bleed hero photo (App.css's
  // overviewHeroDrift). Dylan's ask: let him customize "the animation of
  // the photo for each life area" himself instead of one fixed speed for
  // everyone. Separate from animationIntensity above, which only scales
  // the celebration layer (toasts/achievements/mode-switch flash), not
  // this continuous background loop.
  heroMotion: 'normal',
  soundEffects: true,
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
  {
    key: 'newsprint',
    name: 'Newsprint',
    tagline: 'Black + one red, always',
    description: "Overrides every mode's color with black ink and a single deep red. Serif masthead headings, a fine halftone dot texture, hard offset drop-shadows instead of glows, and zero motion — the deliberately quiet, serious option.",
  },
  {
    key: 'vapor-bloom',
    name: 'Vapor Bloom',
    tagline: 'Purple, pink, teal, always',
    description: "Overrides every mode's color with a soft purple/pink/teal gradient. Rounded Comfortaa headings, pill-shaped cards, and two blurred color blobs that slowly drift behind the page.",
  },
  {
    key: 'blueprint',
    name: 'Blueprint',
    tagline: 'Navy + amber, always',
    description: "Overrides every mode's color with drafting-table navy and amber. Graph-paper grid lines, dashed dimension-style borders, and corner registration marks on every card.",
  },
  {
    key: 'handwritten-journal',
    name: 'Handwritten Journal',
    tagline: 'Ink blue + aged gold, always',
    description: "Overrides every mode's color with a warm, low-lit journal palette — ink blue and aged gold on dark leather-brown. Caveat handwriting for headings, wavy hand-drawn underlines, and a jagged torn-paper edge on every card.",
  },
  {
    key: 'holographic-chrome',
    name: 'Holographic Chrome',
    tagline: 'Shifting rainbow chrome, always',
    description: "Overrides every mode's color with cool chrome silver plus a slowly hue-shifting rainbow sheen. Angular sheared panels, glossy metallic highlights, and a short glitch flicker when you hover.",
  },
  {
    key: 'spring-bloom',
    name: 'Spring Bloom',
    tagline: 'Blossom pink + fresh green, always',
    description: "Overrides every mode's color with blossom pink and fresh green. Soft rounded Quicksand headings, a scatter of blurred petal-dot texture behind the page, and gently rounded cards.",
  },
  {
    key: 'summer-blaze',
    name: 'Summer Blaze',
    tagline: 'Sun orange + teal, always',
    description: "Overrides every mode's color with bright sun orange and beach teal. Bold Poppins headings and a faint sunburst of rays radiating from the top of the page.",
  },
  {
    key: 'autumn-harvest',
    name: 'Autumn Harvest',
    tagline: 'Amber + rust, always',
    description: "Overrides every mode's color with harvest amber and rust. Elegant Playfair Display headings and a drift of warm, diagonal falling-leaf streaks behind the page.",
  },
  {
    key: 'winter-frost',
    name: 'Winter Frost',
    tagline: 'Ice blue + silver, always',
    description: "Overrides every mode's color with ice blue and silver. Crisp Cormorant Garamond headings and a scatter of faint snowflake dots on a near-black frozen backdrop.",
  },
  {
    key: 'pixel-quest',
    name: 'Pixel Quest',
    tagline: 'Coin gold + power green, always',
    description: "Overrides every mode's color with coin gold and power green. Blocky 8-bit Press Start 2P headings, square corners, thick black borders with a hard offset shadow instead of a glow, a scatter of pixel stars, and buttons that jump on hover and stomp down when pressed.",
  },
]

// A third, independent global "skin" dimension: mood/intensity applied on
// top of whichever mode color and design system are active, via saturation/
// brightness/contrast multipliers (see the COLOR PALETTES section in
// App.css) rather than swapping hues — so it never fights the 9 mode colors
// or the 14 design systems, it just turns the whole thing up or down.
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
    tagline: 'Nearly grayscale',
    description: "Pushed hard toward gray — colors are barely there anymore, just a whisper of hue. Not subtle.",
  },
  {
    key: 'rich',
    name: 'Rich',
    tagline: 'Dark, saturated, heavy',
    description: 'Colors pushed way up and brightness pulled way down — deep, almost jewel-toned, with real weight to it.',
  },
  {
    key: 'pastel',
    name: 'Pastel',
    tagline: 'Washed-out and bright',
    description: 'Saturation cut hard and brightness pushed way up — closer to an overexposed photo than a gentle tint.',
  },
  {
    key: 'high-contrast',
    name: 'High Contrast',
    tagline: 'As loud as it gets',
    description: 'Saturation and contrast both pushed to their real limits — colors hit as hard as this app can make them without breaking.',
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
  mind: 'What daily habits do you want to hold yourself to, and what patterns in your own thinking do you want to get better at noticing?',
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
    icon: FootballIcon,
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
    prompts: ['Review my portfolio risk', 'Screen a new stock idea', 'Check my net worth goal'],
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
    // Was '244, 63, 94' (a red-pink that duplicated Mind, née Discipline) — the
    // theme-reading CSS class was fixed to sepia/brown in an earlier
    // session, but this object (used directly by ModePage/OverviewPage
    // card gradients) was never updated to match. Fixed here.
    rgb: '146, 100, 63',
    rgb2: '196, 149, 92',
    headline: '0 pages today',
    subtitle: 'Goal of 10 pages a day',
    metricLabel: 'PAGES',
    metricValue: '0 / 10',
    assistantMessage:
      "Tell me what you're reading — I'll help you track your pages.",
    prompts: ["Log today's pages", 'Recommend what to read next'],
  },
  {
    key: 'mind',
    assistantName: 'The Compass',
    assistantTitle: 'Self-mastery guide',
    icon: Brain,
    title: 'Mind',
    rgb: '99, 102, 241',
    rgb2: '79, 70, 229',
    headline: 'No habits set',
    subtitle: 'Understand yourself. Control yourself. Think clearly.',
    metricLabel: 'TODAY',
    metricValue: '0 / 0',
    assistantMessage:
      "Tell me the habits you want to build, or what's on your mind — I'll help you track it.",
    prompts: ['Set up my daily habits', "Did I complete today's checklist?"],
  },
  {
    key: 'family',
    assistantName: 'The Anchor',
    assistantTitle: 'Family & faith expert',
    icon: Users,
    title: 'Family/Faith',
    // Was '99, 102, 241' (indigo, too close to Finance's blue) — the
    // theme-family CSS class was fixed to coral-rose in an earlier
    // session, but this object (used directly by ModePage/OverviewPage
    // card gradients) was never updated to match. Fixed here.
    rgb: '244, 114, 143',
    rgb2: '251, 165, 175',
    headline: 'No family added',
    subtitle: 'Check-ins, time together, and faith practice',
    metricLabel: 'TIME THIS WEEK',
    metricValue: '0H / 6H',
    assistantMessage:
      "Tell me about your family and faith life — I'll help you track check-ins, time together, and whatever faith practice matters to you.",
    prompts: ['Add a family member', 'Plan a family check-in', 'Log a moment of faith or reflection'],
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
