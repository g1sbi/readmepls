// Guard for the View Transitions API: animate cross-route navigation only when
// the browser supports it (Firefox does not) AND the user allows motion.
export function shouldAnimateNavigation(doc: Document, mql: MediaQueryList): boolean {
  return typeof (doc as { startViewTransition?: unknown }).startViewTransition === "function" && !mql.matches;
}
