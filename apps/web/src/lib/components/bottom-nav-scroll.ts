// Pure scroll-direction visibility for the mobile bottom nav.
// Hide when scrolling down; reveal when scrolling up; always show near the top.
export const NAV_SCROLL_THRESHOLD = 8;
export const NAV_TOP_ZONE = 24;

export function nextNavVisible(
  prevY: number,
  curY: number,
  wasVisible: boolean,
  threshold: number = NAV_SCROLL_THRESHOLD,
): boolean {
  if (curY <= NAV_TOP_ZONE) return true; // always visible near the top
  const delta = curY - prevY;
  if (Math.abs(delta) < threshold) return wasVisible; // ignore jitter
  return delta < 0; // scrolling up → visible, down → hidden
}
