import { z } from "zod";

export type CaptureResult =
  | { kind: "saved"; articleId: string }
  | { kind: "already"; articleId: string }
  | { kind: "quota" }
  | { kind: "unauthorized" }
  | { kind: "error"; message: string };

const OkBody = z.object({ articleId: z.string(), cached: z.boolean() });

export function trimTrailingSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

/** Send the current page URL to the app's capture endpoint with a bearer token. */
export async function capture(
  fetchFn: typeof fetch,
  instanceUrl: string,
  token: string,
  url: string,
): Promise<CaptureResult> {
  let res: Response;
  try {
    res = await fetchFn(`${trimTrailingSlash(instanceUrl)}/api/capture`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url }),
    });
  } catch {
    return { kind: "error", message: "network" };
  }

  if (res.status === 401) return { kind: "unauthorized" };
  if (res.status === 402) return { kind: "quota" };
  if (!res.ok) return { kind: "error", message: `http ${res.status}` };

  const body = await res.json().catch(() => null);
  const parsed = OkBody.safeParse(body);
  if (!parsed.success) return { kind: "error", message: "bad response" };

  return parsed.data.cached
    ? { kind: "already", articleId: parsed.data.articleId }
    : { kind: "saved", articleId: parsed.data.articleId };
}
