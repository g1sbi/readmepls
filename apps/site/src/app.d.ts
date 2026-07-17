// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {}
}

// Vite `?raw` imports resolve to the file's contents as a string at build time.
declare module "*?raw" {
  const content: string;
  export default content;
}

export {};
