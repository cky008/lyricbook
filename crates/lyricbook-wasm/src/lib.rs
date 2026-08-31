use lyricbook_core::{booklet_imposition, validate_project, Project};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn validate_project_json(input: &str) -> Result<(), JsValue> {
    let project: Project = serde_json::from_str(input)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    validate_project(&project).map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen]
pub fn booklet_imposition_json(total_pages: usize) -> Result<String, JsValue> {
    let sheets = booklet_imposition(total_pages).map_err(|error| JsValue::from_str(&error))?;
    serde_json::to_string(&sheets).map_err(|error| JsValue::from_str(&error.to_string()))
}
