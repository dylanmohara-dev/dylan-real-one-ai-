// The "zoom into a window, life area visible outside it" mode-switch
// transition Dylan asked for (session 37) -- a real, from-scratch build,
// not a reskin of the old full-screen ModeTransition flash. Deliberately
// kept as a separate component/system rather than folded into
// ModeTransition.jsx: the old flash covers the ENTIRE screen (see
// App.jsx's ModeTransition usage, still available as the 'wipe'/'fade'
// Enter Animation options), while this one only ever covers
// .main-content -- the sidebar stays visible and interactive the whole
// time, which is the "life area on the outside" part of what Dylan asked
// for. Mixing the two mechanisms into one component would have made both
// harder to reason about for no real benefit.
//
// The technique is a manual FLIP (First-Last-Invert-Play): App.jsx
// measures where the transition should start (the destination mode's
// sidebar icon, found via [data-nav-key] -- this makes it work no matter
// where the switch was actually triggered from: a direct sidebar click, an
// Overview mode-card, search, a chat action) and where it should end (the
// .main-content box), then hands both rects here. Everything below is
// pure CSS transform + opacity (GPU-composited, no layout thrashing) --
// the actual keyframes live in App.css's ZOOM TRANSITION section.
export default function ZoomTransition({ zoomKey, origin, coverRect, mode, heroUrl, onComplete }) {
  if (!origin || !coverRect || coverRect.width === 0 || coverRect.height === 0) return null

  const originCenterX = origin.left + origin.width / 2
  const originCenterY = origin.top + origin.height / 2

  // Where the origin icon sits as a percentage of the (unscaled) cover
  // box -- this becomes the panel's transform-origin, so scaling the
  // panel down to icon-size keeps that exact point fixed on screen
  // instead of drifting toward whichever corner CSS would otherwise pick.
  const originXPct = ((originCenterX - coverRect.left) / coverRect.width) * 100
  const originYPct = ((originCenterY - coverRect.top) / coverRect.height) * 100

  // The scale the panel starts (and ends) at -- icon size relative to the
  // full content box it's about to cover. Floored so a tiny/zero-size
  // rect (a layout edge case) can never produce an invisible or inverted
  // panel.
  const scaleX0 = Math.max(origin.width / coverRect.width, 0.02)
  const scaleY0 = Math.max(origin.height / coverRect.height, 0.02)

  return (
    <div
      key={zoomKey}
      className="zoom-transition"
      aria-hidden="true"
      // Bug Dylan hit ("the transition doesn't come off the screen, it's
      // stuck top-left"): the panel's animation uses `forwards` fill mode
      // (so it visibly holds its LAST frame -- scaled back down to
      // icon-size, sitting at the origin point -- rather than snapping
      // back to invisible), but nothing was ever unmounting this overlay
      // once that final frame was reached. It sat there, frozen at
      // icon-size in the corner, forever, until the NEXT mode switch's new
      // zoomKey happened to remount over it. Listening for the panel's
      // own animationend here and calling onComplete (which sets
      // App.jsx's zoomTransition state back to null, unmounting this
      // whole tree) fixes that, and self-adjusts to the Settings
      // animation-speed multiplier instead of a hardcoded JS timeout that
      // could drift from it.
      //
      // Session 40: the streaks/scanlines/title-card/icon-pop sub-layers
      // that used to also live in this tree are gone -- Dylan's ask was
      // "smooth clean and minimal," and a single panel doing a short,
      // monotonic scale/blur/fade (see App.css's zoomPanelPlay) is both
      // simpler to keep glitch-free and the actual "clean" look he asked
      // for, not a loading-screen's worth of overlapping effects.
      onAnimationEnd={onComplete}
      style={{
        left: `${coverRect.left}px`,
        top: `${coverRect.top}px`,
        width: `${coverRect.width}px`,
        height: `${coverRect.height}px`,
        // The 3D "camera" (App.css's perspective: 1400px on this element)
        // pushes toward/away from THIS point, not the box's center -- so
        // the fly-through actually originates from the sidebar icon that
        // was clicked, matching where the panel itself scales from.
        perspectiveOrigin: `${originXPct}% ${originYPct}%`,
      }}
    >
      <div
        className={`zoom-transition-panel${heroUrl ? ' has-photo' : ''}`}
        style={{
          transformOrigin: `${originXPct}% ${originYPct}%`,
          '--zoom-scale-x0': scaleX0,
          '--zoom-scale-y0': scaleY0,
          ...(heroUrl ? { '--zoom-hero': `url(${heroUrl})` } : {}),
        }}
      />
      <div className="zoom-transition-loader">
        <div className="zoom-transition-spinner" />
        <span className="zoom-transition-loader-label">
          Loading{mode?.title ? ` ${mode.title}` : ''}...
        </span>
      </div>
    </div>
  )
}
