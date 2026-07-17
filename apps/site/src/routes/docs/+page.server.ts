import type { PageServerLoad } from "./$types";
import compose from "../../../../../compose.yml?raw";
import envExample from "../../../../../.env.example?raw";

// compose.yml and .env.example are inlined from the repo root at build time via
// Vite's ?raw, so the prerendered docs page always matches the files
// self-hosters actually copy — with no filesystem access at prerender. (The
// earlier import.meta.url approach broke once the server bundle moved under
// .svelte-kit/output, resolving the path to a non-existent file.) The Docker
// build stage COPYs both files so Rollup can read them there too.
export const load: PageServerLoad = () => ({ compose, envExample });
