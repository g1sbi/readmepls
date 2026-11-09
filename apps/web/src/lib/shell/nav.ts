export type NavKey = "home" | "library";

export interface NavItem {
  key: NavKey;
  label: string;
  href: "/" | "/library";
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "home", label: "Home", href: "/" },
  { key: "library", label: "Library", href: "/library" },
];

const pathOf = (pathname: string) => pathname.split(/[?#]/)[0] ?? "";

const under = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

export function activeKey(
  pathname: string,
): NavKey | "collections" | "settings" | null {
  pathname = pathOf(pathname);
  if (pathname === "/") return "home";
  if (under(pathname, "/library") || under(pathname, "/read")) return "library";
  if (under(pathname, "/collections")) return "collections";
  if (under(pathname, "/settings")) return "settings";
  return null;
}

export type ShellKind = "app" | "reader" | "none";

export function shellFor(pathname: string): ShellKind {
  const path = pathOf(pathname);
  if (under(path, "/login") || under(path, "/verify")) return "none";
  if (under(path, "/read")) return "reader";
  return "app";
}
