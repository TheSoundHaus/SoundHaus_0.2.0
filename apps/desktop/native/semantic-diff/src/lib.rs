#![deny(clippy::all)]

//! NAPI-RS entry point for the Ableton Live Set semantic diff parser.
//!
//! Exports two functions to Node.js:
//! - `parseXml(currentPath, oldPath)` — file-path based (backward compat)
//! - `parseXmlFromBuffer(currentBuf, oldBuf)` — buffer-based (git blob in-memory)

mod models;
mod parser;
mod diff;
mod utils;

use napi_derive::napi;
use napi::bindgen_prelude::Buffer;

/// Parse and diff two Ableton Live Set files by file path.
///
/// Returns a JSON string containing the full DiffReport:
/// `{ stats, changes, project }`
#[napi]
pub fn parse_xml(current_filepath: String, old_als_path: String) -> napi::Result<String> {
    let current_project = parser::parse_als_file(&current_filepath)
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to parse current ALS: {}", e)))?;

    let old_project = parser::parse_als_file(&old_als_path)
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to parse old ALS: {}", e)))?;

    let report = diff::diff_projects(&old_project, &current_project);

    serde_json::to_string(&report)
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to serialize report: {}", e)))
}

/// Parse and diff two Ableton Live Set files from in-memory buffers.
///
/// Accepts gzip-compressed or plain XML buffers (auto-detected).
/// This enables diffing git blobs directly without writing to disk.
///
/// Returns a JSON string containing the full DiffReport.
#[napi]
pub fn parse_xml_from_buffer(current_buf: Buffer, old_buf: Buffer) -> napi::Result<String> {
    let current_project = parser::parse_als_buffer(&current_buf)
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to parse current buffer: {}", e)))?;

    let old_project = parser::parse_als_buffer(&old_buf)
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to parse old buffer: {}", e)))?;

    let report = diff::diff_projects(&old_project, &current_project);

    serde_json::to_string(&report)
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to serialize report: {}", e)))
}

/// Parse a single Ableton Live Set file and return its structure as JSON.
/// Useful for displaying track info without diffing.
#[napi]
pub fn parse_als(filepath: String) -> napi::Result<String> {
    let project = parser::parse_als_file(&filepath)
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to parse ALS: {}", e)))?;

    serde_json::to_string(&project)
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to serialize project: {}", e)))
}
