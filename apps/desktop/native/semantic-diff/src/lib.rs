#![deny(clippy::all)]

//! NAPI-RS entry point for the Ableton Live Set semantic diff parser.
//!
//! Exports to Node.js:
//! - `parseXmlFromBuffer(currentBuf, oldBuf)` — primary diff path (git blob in-memory, no temp files)
//! - `parseAls(filepath)` — serialize a single ALS to a Project JSON snapshot
//! - `diffFromSnapshot(snapshotJson, alsPath)` — fast diff from committed snapshot JSON
//! - `generateCommitMessage(diffReportJson)` — human-readable commit message from a DiffReport
//! - `parseXml(currentPath, oldPath)` — file-path based (kept for compatibility)

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
pub async fn parse_xml(current_filepath: String, old_als_path: String) -> napi::Result<String> {
    tokio::task::spawn_blocking(move || {
        let current_project = parser::parse_als_file(&current_filepath)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to parse current ALS: {}", e)))?;

        let old_project = parser::parse_als_file(&old_als_path)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to parse old ALS: {}", e)))?;

        let report = diff::diff_projects(&old_project, &current_project);

        serde_json::to_string(&report)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to serialize report: {}", e)))
    })
    .await
    .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Task panicked: {}", e)))?
}

/// Parse and diff two Ableton Live Set files from in-memory buffers.
///
/// Accepts gzip-compressed or plain XML buffers (auto-detected).
/// This enables diffing git blobs directly without writing to disk.
///
/// Returns a JSON string containing the full DiffReport.
#[napi]
pub async fn parse_xml_from_buffer(current_buf: Buffer, old_buf: Buffer) -> napi::Result<String> {
    // Convert Buffer to Vec<u8> before moving into the blocking thread (Buffer is !Send)
    let current_vec: Vec<u8> = current_buf.to_vec();
    let old_vec: Vec<u8> = old_buf.to_vec();

    tokio::task::spawn_blocking(move || {
        let current_project = parser::parse_als_buffer(&current_vec)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to parse current buffer: {}", e)))?;

        let old_project = parser::parse_als_buffer(&old_vec)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to parse old buffer: {}", e)))?;

        let report = diff::diff_projects(&old_project, &current_project);

        serde_json::to_string(&report)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to serialize report: {}", e)))
    })
    .await
    .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Task panicked: {}", e)))?
}

/// Parse a single Ableton Live Set file and serialize it as a Project JSON snapshot.
/// Primary snapshot serialization path: result is written to `.soundhaus/{session}/snapshot.json`.
#[napi]
pub async fn parse_als(filepath: String) -> napi::Result<String> {
    tokio::task::spawn_blocking(move || {
        let project = parser::parse_als_file(&filepath)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to parse ALS: {}", e)))?;

        serde_json::to_string(&project)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to serialize project: {}", e)))
    })
    .await
    .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Task panicked: {}", e)))?
}

/// Diff a previously-serialized Project snapshot against the current ALS file.
///
/// `snapshot_json` — the contents of `.soundhaus/{session}/snapshot.json` from the last commit.
/// `current_als_path` — absolute path to the current .als file on disk.
///
/// Returns the same JSON DiffReport shape as `parseXmlFromBuffer`, enabling the
/// `get-changes` IPC handler to skip re-parsing the HEAD ALS blob entirely.
#[napi]
pub async fn diff_from_snapshot(snapshot_json: String, current_als_path: String) -> napi::Result<String> {
    tokio::task::spawn_blocking(move || {
        let old_project: models::Project = serde_json::from_str(&snapshot_json)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to deserialize snapshot: {}", e)))?;

        let current_project = parser::parse_als_file(&current_als_path)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to parse current ALS: {}", e)))?;

        let report = diff::diff_projects(&old_project, &current_project);

        serde_json::to_string(&report)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to serialize report: {}", e)))
    })
    .await
    .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Task panicked: {}", e)))?
}

/// Generate a human-readable git commit message from a serialized DiffReport JSON string.
/// Mirrors the `buildCommitMessage` logic previously in `main.ts`.
#[napi]
pub async fn generate_commit_message(diff_report_json: String) -> napi::Result<String> {
    tokio::task::spawn_blocking(move || {
        let report: models::DiffReport = serde_json::from_str(&diff_report_json)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to deserialize diff report: {}", e)))?;
        Ok(build_commit_message(&report))
    })
    .await
    .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Task panicked: {}", e)))?
}

// ─────────────────────────────────────────────
// Commit message helpers (private)
// ─────────────────────────────────────────────

fn build_commit_message(report: &models::DiffReport) -> String {
    let changes = &report.changes;
    let stats = &report.stats;

    if changes.is_empty() {
        return "Update project".to_string();
    }

    if changes.len() <= 3 {
        let parts: Vec<String> = changes.iter().map(describe_change).collect();
        return parts.join(", ");
    }

    let mut parts: Vec<String> = Vec::new();
    if stats.added > 0   { parts.push(format!("{} track{} added",   stats.added,   if stats.added   > 1 { "s" } else { "" })); }
    if stats.removed > 0 { parts.push(format!("{} track{} removed", stats.removed, if stats.removed > 1 { "s" } else { "" })); }
    if stats.renamed > 0 { parts.push(format!("{} renamed",  stats.renamed)); }
    if stats.modified > 0 { parts.push(format!("{} modified", stats.modified)); }
    if stats.moved > 0   { parts.push(format!("{} moved",    stats.moved)); }

    if parts.is_empty() {
        "Update project".to_string()
    } else {
        format!("Update project: {}", parts.join(", "))
    }
}

fn describe_change(c: &models::ChangeNode) -> String {
    match c.action.as_str() {
        "added"        => format!("Add {}", c.label),
        "removed"      => format!("Remove {}", c.label),
        "renamed" | "likely_rename" => format!(
            "Rename {} \u{2192} {}",
            c.from.as_deref().unwrap_or(&c.label),
            c.to.as_deref().unwrap_or(&c.label)
        ),
        "moved"        => format!("Move {}", c.label),
        "modified" => {
            if let Some(swap) = c.children.iter().find(|ch| ch.action == "instrument_swap") {
                return format!(
                    "Swap instrument on {} ({} \u{2192} {})",
                    c.label,
                    swap.from.as_deref().unwrap_or("?"),
                    swap.to.as_deref().unwrap_or("?")
                );
            }
            let added: Vec<_>   = c.children.iter().filter(|ch| ch.change_type == "Device" && ch.action == "added").collect();
            let removed: Vec<_> = c.children.iter().filter(|ch| ch.change_type == "Device" && ch.action == "removed").collect();
            if added.len() == 1 && removed.is_empty() {
                return format!("Add {} to {}", added[0].label, c.label);
            }
            if removed.len() == 1 && added.is_empty() {
                return format!("Remove {} from {}", removed[0].label, c.label);
            }
            format!("Update {}", c.label)
        },
        "value_change" => format!(
            "{} {} \u{2192} {}",
            c.label,
            c.from.as_deref().unwrap_or("?"),
            c.to.as_deref().unwrap_or("?")
        ),
        _ => format!("{} {}", c.action, c.label),
    }
}
