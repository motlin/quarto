// ⚡ Dev server for the single-file prototype: serves web/index.html with the solver wasm inlined on each request.
import { readFile } from "node:fs/promises";
import { defineConfig } from "vite";
import { inlineWasm } from "./web/inline.mjs";

const wasmUrl = new URL("./web/solver.wasm", import.meta.url);

export default defineConfig({
  root: "web",
  server: { port: 3002, strictPort: true },
  plugins: [
    {
      name: "inline-solver-wasm",
      transformIndexHtml: async (html) => inlineWasm(html, await readFile(wasmUrl)),
    },
  ],
});
