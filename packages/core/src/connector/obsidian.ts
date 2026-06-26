import type { ConnectorPlugin, ExportResult } from "./plugin.js";
import { NotImplementedError } from "./plugin.js";

export class ObsidianConnector implements ConnectorPlugin {
  readonly type = "obsidian";
  readonly stub = true;
  async export(): Promise<ExportResult> {
    throw new NotImplementedError(this.type);
  }
}
