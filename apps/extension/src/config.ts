export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface ExtConfig {
  instanceUrl: string;
  pbUrl: string;
}

export const DEFAULT_INSTANCE_URL = "https://app.readmepls.com";

export async function getConfig(storage: StorageArea): Promise<ExtConfig> {
  const raw = await storage.get(["instanceUrl", "pbUrl"]);
  const instanceUrl =
    typeof raw.instanceUrl === "string" && raw.instanceUrl
      ? raw.instanceUrl
      : DEFAULT_INSTANCE_URL;
  const pbUrl = typeof raw.pbUrl === "string" ? raw.pbUrl : "";
  return { instanceUrl, pbUrl };
}

export async function setConfig(
  storage: StorageArea,
  cfg: Partial<ExtConfig>,
): Promise<void> {
  await storage.set({ ...cfg });
}
