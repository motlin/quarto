// 📦 Inlines web/solver.wasm into web/index.html as base64 and writes dist/quarto.html.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const template = await readFile(new URL("./index.html", import.meta.url), "utf8");
const wasm = await readFile(new URL("./solver.wasm", import.meta.url));
const placeholder = "__WASM_BASE64__";
if (!template.includes(placeholder)) throw new Error("template is missing the wasm placeholder");
const page = template.replace(placeholder, wasm.toString("base64"));
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
const output = new URL("../dist/quarto.html", import.meta.url);
await writeFile(output, page);
console.log(`wrote ${output.pathname} (${(page.length / 1024).toFixed(0)} KB, wasm ${(wasm.length / 1024).toFixed(0)} KB)`);
