// lucide-react (the icon set this whole app uses) has no American football
// icon -- checked directly rather than faking it with the closest generic
// athletic icon. This is a small hand-drawn one instead, built to the same
// interface every lucide icon exposes (size/strokeWidth/className props,
// currentColor stroke) so it drops into every spot mode.icon is already
// rendered as a component (Sidebar, OverviewPage, ModePage, ChatPage,
// ModeChatLauncher, ModeTransition) with zero changes needed there.
export default function FootballIcon({ size = 24, strokeWidth = 2, className, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <g transform="rotate(45 12 12)">
        <ellipse cx="12" cy="12" rx="9" ry="5" />
        <line x1="5" y1="12" x2="19" y2="12" />
        <line x1="9" y1="10" x2="9" y2="14" />
        <line x1="12" y1="9.5" x2="12" y2="14.5" />
        <line x1="15" y1="10" x2="15" y2="14" />
      </g>
    </svg>
  )
}
