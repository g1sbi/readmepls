// Shared row style for sidebar links: >=44px, pill, ink when active, and a
// gentle nudge on hover for fine pointers only (never a hover-only affordance).
const base =
  "flex min-h-11 items-center gap-3 rounded-full px-4 text-sm font-medium no-underline outline-none transition-[background-color,transform] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:transform-none";
const idle =
  "text-foreground [@media(hover:hover)]:hover:translate-x-0.5 [@media(hover:hover)]:hover:bg-accent motion-reduce:[@media(hover:hover)]:hover:translate-x-0";
const current = "bg-inverse text-inverse-foreground";

export const sidebarRow = (active: boolean) =>
  `${base} ${active ? current : idle}`;
