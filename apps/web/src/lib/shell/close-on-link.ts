/**
 * Click handler for a nav container: a plain link tap navigates, so the
 * overlay gets out of the way. Modified clicks (new tab/window) leave the
 * page in place, so they leave it open.
 */
export function closeOnLink(onClose: () => void) {
  return (e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0)
      return;
    if ((e.target as Element).closest("a")) onClose();
  };
}
