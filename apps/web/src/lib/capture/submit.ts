export type CaptureResult =
  | { ok: true }
  | { ok: false; reason: "empty" | "quota" | "rejected" | "network" };

export const CAPTURE_MESSAGES: Record<
  "quota" | "rejected" | "network",
  string
> = {
  quota: "You've reached this month's limit — upgrade to save more.",
  rejected: "That link couldn't be saved. Check the address and try again.",
  network: "You're offline or the server didn't answer. Try again.",
};

// fetch is injected so tests (and any caller) own the network edge.
export async function submitCapture(
  fetchFn: typeof fetch,
  url: string,
): Promise<CaptureResult> {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  try {
    const res = await fetchFn("/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: trimmed }),
    });
    if (res.status === 402) return { ok: false, reason: "quota" };
    if (!res.ok) return { ok: false, reason: "rejected" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "network" };
  }
}
