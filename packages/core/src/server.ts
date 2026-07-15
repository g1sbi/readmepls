// Server/worker-only exports. Kept out of index.ts so client bundles (web app
// browser code importing "@readmepls/core") never pull in jsdom or other
// Node-only libraries these modules depend on.
export * from "./source/favicon.js";
