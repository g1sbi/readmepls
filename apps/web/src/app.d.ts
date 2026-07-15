import type PocketBase from "pocketbase";
import type { Tier } from "@readmepls/types";

declare global {
  namespace App {
    interface Locals {
      pb: PocketBase;
      userId: string | null;
    }
    interface PageData {
      tier: Tier | null;
      selfHosted: boolean;
    }
  }
}

export {};
