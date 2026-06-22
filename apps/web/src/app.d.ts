import type PocketBase from "pocketbase";

declare global {
  namespace App {
    interface Locals {
      pb: PocketBase;
      userId: string | null;
    }
  }
}

export {};
