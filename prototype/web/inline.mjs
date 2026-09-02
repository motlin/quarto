// 📦 Replaces the wasm placeholder in the page template with the solver bytes as base64.
export const placeholder = "__WASM_BASE64__";

export function inlineWasm(template, wasm) {
  if (!template.includes(placeholder)) throw new Error("template is missing the wasm placeholder");
  return template.replace(placeholder, wasm.toString("base64"));
}
