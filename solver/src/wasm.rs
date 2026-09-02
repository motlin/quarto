//! JavaScript bindings, compiled only for `wasm32` with the `wasm` feature.

use wasm_bindgen::prelude::wasm_bindgen;

/// The crate version, exposed so the web app can display which solver it loaded.
#[wasm_bindgen]
#[must_use]
pub fn version() -> String {
	env!("CARGO_PKG_VERSION").to_string()
}
