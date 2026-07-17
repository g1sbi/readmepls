import PocketBase from "pocketbase";

export interface PbClient {
  authStore: {
    token: string;
    isValid: boolean;
    save(token: string, model: unknown): void;
    clear(): void;
  };
  collection(name: string): {
    authWithPassword(
      email: string,
      password: string,
    ): Promise<{ token: string }>;
    authRefresh(): Promise<unknown>;
  };
}

export function makePb(pbUrl: string): PbClient {
  return new PocketBase(pbUrl) as unknown as PbClient;
}

/** Sign in against PocketBase and return the session JWT. */
export async function login(
  pb: PbClient,
  email: string,
  password: string,
): Promise<string> {
  await pb.collection("users").authWithPassword(email, password);
  return pb.authStore.token;
}

/** Validate a stored JWT against PocketBase; return a fresh token or null. */
export async function getValidToken(
  pb: PbClient,
  token: string,
): Promise<string | null> {
  if (!token) return null;
  pb.authStore.save(token, null);
  try {
    await pb.collection("users").authRefresh();
    return pb.authStore.isValid ? pb.authStore.token : null;
  } catch {
    pb.authStore.clear();
    return null;
  }
}
