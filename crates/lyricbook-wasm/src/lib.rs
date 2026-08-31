//! Browser-facing WASM bindings for deterministic LyricBook domain operations.

use lyricbook_core::{Project, booklet_imposition, padded_booklet_page_count, validate_project};
use wasm_bindgen::prelude::*;

/// Installs a readable panic hook in development and production browsers.
#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

/// Validates serialized project JSON.
#[wasm_bindgen]
pub fn validate_project_json(input: &str) -> Result<(), JsValue> {
    let project: Project =
        serde_json::from_str(input).map_err(|error| JsValue::from_str(&error.to_string()))?;
    validate_project(&project).map_err(|error| JsValue::from_str(&error.to_string()))
}

/// Returns booklet imposition as JSON, padding the page count when necessary.
#[wasm_bindgen]
pub fn booklet_imposition_json(total_pages: usize) -> Result<String, JsValue> {
    let padded = padded_booklet_page_count(total_pages);
    let sheets = booklet_imposition(padded).map_err(|error| JsValue::from_str(&error))?;
    serde_json::to_string(&sheets).map_err(|error| JsValue::from_str(&error.to_string()))
}
