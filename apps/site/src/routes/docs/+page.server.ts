import { readFileSync } from "node:fs";
import type { PageServerLoad } from "./$types";

// Reads the actual repo-root compose.yml/.env.example at build time (this
// route is prerendered — see ../+layout.ts) so the docs page can never drift
// from the files self-hosters actually copy.
export const load: PageServerLoad = () => {
  const compose = readFileSync(
    new URL("../../../../../compose.yml", import.meta.url),
    "utf8",
  );
  const envExample = readFileSync(
    new URL("../../../../../.env.example", import.meta.url),
    "utf8",
  );
  return { compose, envExample };
};
