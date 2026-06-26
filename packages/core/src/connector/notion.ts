import type { ConnectorPlugin, ExportResult } from "./plugin.js";
import { NotImplementedError } from "./plugin.js";

export class NotionConnector implements ConnectorPlugin {
  readonly type = "notion";
  readonly stub = true;
  async export(): Promise<ExportResult> {
    throw new NotImplementedError(this.type);
  }
}
