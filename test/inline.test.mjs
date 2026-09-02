import { test } from "node:test";
import assert from "node:assert/strict";
import { inlineWasm, placeholder } from "../web/inline.mjs";

test("inlineWasm replaces the placeholder with the base64 wasm bytes", () => {
  const wasm = Buffer.from([0x00, 0x61, 0x73, 0x6d]);
  const page = inlineWasm(`const WASM_BASE64 = "${placeholder}";`, wasm);
  assert.equal(page, `const WASM_BASE64 = "${wasm.toString("base64")}";`);
});

test("inlineWasm rejects a template without the placeholder", () => {
  assert.throws(() => inlineWasm("<title>CordoBot</title>", Buffer.alloc(0)), /placeholder/);
});
