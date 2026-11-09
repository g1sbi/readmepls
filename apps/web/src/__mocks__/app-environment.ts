// Stub for $app/environment in vitest. Tests that need dev=false override the
// module with vi.doMock (see routes/dev/components/page.test.ts).
export const dev = true;
export const browser = true;
export const building = false;
export const version = "test";
