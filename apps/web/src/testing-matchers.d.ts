// Pull in jest-dom's own vitest augmentation (the same matchers vitest-setup.ts
// registers at runtime) so `svelte-check` recognises toBeInTheDocument/etc.
import "@testing-library/jest-dom/vitest";
