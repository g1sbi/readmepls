export interface PbLike {
  authStore: {
    loadFromCookie(cookie: string): void;
    save(token: string, model: unknown): void;
    clear(): void;
    isValid: boolean;
    token: string;
    model: { id?: string } | null;
  };
  collection(name: string): { authRefresh(): Promise<unknown> };
}

export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer (.+)$/.exec(header.trim());
  return m ? m[1] : null;
}

/**
 * Resolve the request's user. Prefers the existing PocketBase session cookie;
 * falls back to an `Authorization: Bearer <pb-jwt>` header (used by the browser
 * extension, which has no cookie). `viaBearer` tells the caller not to write a
 * Set-Cookie back to a cross-origin client.
 */
export async function resolvePbAuth(
  pb: PbLike,
  cookie: string,
  authHeader: string | null,
): Promise<{ userId: string | null; viaBearer: boolean }> {
  pb.authStore.loadFromCookie(cookie);
  if (pb.authStore.isValid) {
    try {
      await pb.collection("users").authRefresh();
      if (pb.authStore.isValid) {
        return { userId: pb.authStore.model?.id ?? null, viaBearer: false };
      }
    } catch {
      pb.authStore.clear();
    }
  }

  const bearer = parseBearer(authHeader);
  if (bearer) {
    pb.authStore.save(bearer, null);
    try {
      await pb.collection("users").authRefresh();
      if (pb.authStore.isValid) {
        return { userId: pb.authStore.model?.id ?? null, viaBearer: true };
      }
    } catch {
      // fall through to cleared/null
    }
  }

  pb.authStore.clear();
  return { userId: null, viaBearer: false };
}
