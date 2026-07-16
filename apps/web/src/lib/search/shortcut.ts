function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return true;
  return target.contentEditable === "true" || target.isContentEditable;
}

/** Cmd/Ctrl+K opens from anywhere; "/" opens only when focus is not in a field. */
export function isSearchOpenShortcut(e: KeyboardEvent): boolean {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") return true;
  if (
    e.key === "/" &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !isEditable(e.target)
  )
    return true;
  return false;
}
