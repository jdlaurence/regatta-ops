// Motion preferences: prefers-reduced-motion turns off every animation. CSS handles transitions
// and keyframes (globals.css); script-driven motion asks here.

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** `behavior` for scrollIntoView and scrollTo: a jump when motion is reduced. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
