import type { CreateCollectionError } from "./actions.js";

// Inline error copy for the shell (sentence case). The library page keeps its
// own lowercase voice for the duplicate case.
export const createErrorCopy: Record<CreateCollectionError, string> = {
  duplicate: "A collection with that name already exists",
  empty: "Give it a name first",
  failed: "Couldn't create it. Try again.",
  unauthenticated: "Sign in again to create collections.",
};
