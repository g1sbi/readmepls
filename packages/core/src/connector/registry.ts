import type { ConnectorPlugin } from "./plugin.js";
import { MarkdownConnector } from "./markdown/connector.js";
import { NotionConnector } from "./notion.js";
import { ObsidianConnector } from "./obsidian.js";

const registry = new Map<string, ConnectorPlugin>();

export function registerConnector(c: ConnectorPlugin): void {
  registry.set(c.type, c);
}

export function getConnector(type: string): ConnectorPlugin | undefined {
  return registry.get(type);
}

export function listConnectors(): ConnectorPlugin[] {
  return [...registry.values()];
}

registerConnector(new MarkdownConnector());
registerConnector(new NotionConnector());
registerConnector(new ObsidianConnector());
