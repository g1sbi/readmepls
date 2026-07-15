// Test stand-in for SvelteKit's $env/dynamic/public virtual module.
// Mutable so individual tests can set PUBLIC_* values via vi.mock/assignment.
export const env: Record<string, string> = {};
