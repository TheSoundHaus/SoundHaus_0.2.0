//! Semantic diff engine for Ableton Live Set projects.
//!
//! Compares two parsed Project structs and produces a hierarchical DiffReport
//! with smart identity resolution (rename detection, instrument swaps, track
//! moves, CRC-based sample replacement, and Levenshtein confidence scoring).

use std::collections::{HashMap, HashSet};

use crate::models::*;
use crate::utils::{name_similarity, LIKELY_RENAME_THRESHOLD};

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/// Diff two projects and produce a structured DiffReport.
pub fn diff_projects(old: &Project, new: &Project) -> DiffReport {
    let mut stats = DiffStats::new();
    let mut changes = Vec::new();

    // Project-level metadata changes
    diff_project_metadata(old, new, &mut changes);

    // Track-level diffing (the core)
    diff_tracks(&old.tracks, &new.tracks, &mut stats, &mut changes);

    DiffReport {
        stats,
        changes,
        project: new.clone(),
    }
}

// ─────────────────────────────────────────────
// Project metadata diff
// ─────────────────────────────────────────────

fn diff_project_metadata(old: &Project, new: &Project, changes: &mut Vec<ChangeNode>) {
    if old.tempo != new.tempo {
        let from = old.tempo.map(|t| format!("{:.1}", t)).unwrap_or_default();
        let to = new.tempo.map(|t| format!("{:.1}", t)).unwrap_or_default();
        if from != to {
            changes.push(ChangeNode::value_change("Project", "Tempo", &from, &to));
        }
    }

    if old.time_sig_numerator != new.time_sig_numerator
        || old.time_sig_denominator != new.time_sig_denominator
    {
        let from = format!(
            "{}/{}",
            old.time_sig_numerator.unwrap_or(4),
            old.time_sig_denominator.unwrap_or(4)
        );
        let to = format!(
            "{}/{}",
            new.time_sig_numerator.unwrap_or(4),
            new.time_sig_denominator.unwrap_or(4)
        );
        if from != to {
            changes.push(ChangeNode::value_change(
                "Project",
                "Time Signature",
                &from,
                &to,
            ));
        }
    }
}

// ─────────────────────────────────────────────
// Track-level diff
// ─────────────────────────────────────────────

fn diff_tracks(
    old_tracks: &[Track],
    new_tracks: &[Track],
    stats: &mut DiffStats,
    changes: &mut Vec<ChangeNode>,
) {
    // Build maps: id -> (index, track)
    let old_map: HashMap<&str, (usize, &Track)> = old_tracks
        .iter()
        .enumerate()
        .map(|(i, t)| (t.id.as_str(), (i, t)))
        .collect();
    let new_map: HashMap<&str, (usize, &Track)> = new_tracks
        .iter()
        .enumerate()
        .map(|(i, t)| (t.id.as_str(), (i, t)))
        .collect();

    // Collect unmatched tracks for fuzzy matching
    let mut unmatched_old: Vec<&Track> = Vec::new();
    let mut unmatched_new: Vec<&Track> = Vec::new();

    // 1. Check tracks that exist in old but not new (removed or renamed)
    for (id, (_idx, old_track)) in &old_map {
        if !new_map.contains_key(id) {
            unmatched_old.push(old_track);
        }
    }
    // Sort by original position for deterministic output
    unmatched_old.sort_by_key(|t| old_map[t.id.as_str()].0);

    // 2. Check tracks that exist in new but not old (added or renamed)
    for (id, (_idx, new_track)) in &new_map {
        if !old_map.contains_key(id) {
            unmatched_new.push(new_track);
        }
    }
    // Sort by new position for deterministic output
    unmatched_new.sort_by_key(|t| new_map[t.id.as_str()].0);

    // 3. Fuzzy match unmatched tracks using Levenshtein distance on names
    let mut matched_old_ids: HashSet<String> = HashSet::new();
    let mut matched_new_ids: HashSet<String> = HashSet::new();

    for old_track in &unmatched_old {
        let mut best_score = 0.0f64;
        let mut best_match: Option<&Track> = None;

        for new_track in &unmatched_new {
            if matched_new_ids.contains(&new_track.id) {
                continue;
            }
            // Only match tracks of the same type
            if old_track.track_type != new_track.track_type {
                continue;
            }
            let score = name_similarity(&old_track.effective_name, &new_track.effective_name);
            if score > best_score {
                best_score = score;
                best_match = Some(new_track);
            }
        }

        if best_score >= LIKELY_RENAME_THRESHOLD {
            if let Some(new_match) = best_match {
                let mut node = ChangeNode::new("Track", &new_match.effective_name, "likely_rename");
                node.id = Some(new_match.id.clone());
                node.from = Some(old_track.effective_name.clone());
                node.to = Some(new_match.effective_name.clone());
                node.confidence = Some(best_score);
                changes.push(node);
                stats.renamed += 1;

                matched_old_ids.insert(old_track.id.clone());
                matched_new_ids.insert(new_match.id.clone());
            }
        }
    }

    // 4. Remaining unmatched = truly added/removed
    for old_track in &unmatched_old {
        if matched_old_ids.contains(&old_track.id) {
            continue;
        }
        let mut node = ChangeNode::new("Track", &old_track.effective_name, "removed");
        node.id = Some(old_track.id.clone());
        node.context = Some(old_track.track_type.clone());
        changes.push(node);
        stats.removed += 1;
    }

    for new_track in &unmatched_new {
        if matched_new_ids.contains(&new_track.id) {
            continue;
        }
        let mut node = ChangeNode::new("Track", &new_track.effective_name, "added");
        node.id = Some(new_track.id.clone());
        node.context = Some(new_track.track_type.clone());
        changes.push(node);
        stats.added += 1;
    }

    // 5. Matched tracks (same ID in both) — deep diff
    //
    // To detect genuine reorders (not false positives from insertions/deletions
    // shifting indices), compute the LCS of the matched track ordering.
    // Tracks in the LCS preserved their relative order and are NOT moved.
    let matched_ids: Vec<&str> = new_map
        .keys()
        .filter(|id| old_map.contains_key(*id))
        .copied()
        .collect();
    let mut old_order: Vec<&str> = matched_ids.clone();
    old_order.sort_by_key(|id| old_map[id].0);
    let mut new_order: Vec<&str> = matched_ids;
    new_order.sort_by_key(|id| new_map[id].0);
    let stable_ids = lcs_set(&old_order, &new_order);

    // Collect into a sortable Vec so output order matches new track positions
    let mut matched_results: Vec<(usize, ChangeNode)> = Vec::new();
    for (id, (new_idx, new_track)) in &new_map {
        if let Some((_old_idx, old_track)) = old_map.get(id) {
            let truly_moved = !stable_ids.contains(*id);
            let children = diff_track_contents(old_track, new_track, truly_moved);
            if !children.is_empty() {
                let mut node = ChangeNode::new("Track", &new_track.effective_name, "modified");
                node.id = Some(new_track.id.clone());
                node.context = Some(new_track.track_type.clone());
                node.children = children;
                matched_results.push((*new_idx, node));
                stats.modified += 1;
            }
        }
    }
    matched_results.sort_by_key(|(idx, _)| *idx);
    changes.extend(matched_results.into_iter().map(|(_, node)| node));
}

/// Deep diff of a matched track pair. Returns child ChangeNodes.
fn diff_track_contents(
    old: &Track,
    new: &Track,
    truly_moved: bool,
) -> Vec<ChangeNode> {
    let mut children = Vec::new();

    // Rename detection (same ID, different name)
    if old.effective_name != new.effective_name {
        let mut node = ChangeNode::value_change(
            "Property",
            "Name",
            &old.effective_name,
            &new.effective_name,
        );
        node.action = "renamed".to_string();
        children.push(node);
    }

    if old.user_name != new.user_name {
        let old_un = old.user_name.as_deref().unwrap_or("(none)");
        let new_un = new.user_name.as_deref().unwrap_or("(none)");
        children.push(ChangeNode::value_change("Property", "UserName", old_un, new_un));
    }

    // Move detection — only fires for genuine reorders (LCS-based)
    if truly_moved {
        children.push(ChangeNode::new("Track", &new.effective_name, "moved"));
    }

    // Color change
    if old.color != new.color {
        children.push(ChangeNode::value_change(
            "Property",
            "Color",
            &old.color.to_string(),
            &new.color.to_string(),
        ));
    }

    // Instrument swap detection: same track ID, same type, but first device changed
    let old_first = old.device_chain.devices.first();
    let new_first = new.device_chain.devices.first();
    match (old_first, new_first) {
        (Some(od), Some(nd)) if od.class_name != nd.class_name || od.name != nd.name => {
            let old_label = if od.name.is_empty() {
                &od.class_name
            } else {
                &od.name
            };
            let new_label = if nd.name.is_empty() {
                &nd.class_name
            } else {
                &nd.name
            };
            let mut node =
                ChangeNode::value_change("Device", "Main Instrument", old_label, new_label);
            node.action = "instrument_swap".to_string();
            children.push(node);
        }
        _ => {}
    }

    // Device chain diff
    let device_changes = diff_device_chain(&old.device_chain, &new.device_chain);
    children.extend(device_changes);

    // Routing diff
    let routing_changes = diff_routing(&old.routing, &new.routing);
    children.extend(routing_changes);

    // Clip diff
    let clip_changes = diff_clips(&old.clips, &new.clips);
    children.extend(clip_changes);

    children
}

// ─────────────────────────────────────────────
// Device chain diff
// ─────────────────────────────────────────────

fn diff_device_chain(old: &DeviceChain, new: &DeviceChain) -> Vec<ChangeNode> {
    let mut changes = Vec::new();

    let old_map: HashMap<&str, &Device> = old.devices.iter().map(|d| (d.id.as_str(), d)).collect();
    let new_map: HashMap<&str, &Device> = new.devices.iter().map(|d| (d.id.as_str(), d)).collect();

    // Removed devices
    for (id, device) in &old_map {
        if !new_map.contains_key(id) {
            let label = if device.name.is_empty() {
                &device.class_name
            } else {
                &device.name
            };
            let mut node = ChangeNode::new("Device", label, "removed");
            node.id = Some(device.id.clone());
            changes.push(node);
        }
    }

    // Added devices
    for (id, device) in &new_map {
        if !old_map.contains_key(id) {
            let label = if device.name.is_empty() {
                &device.class_name
            } else {
                &device.name
            };
            let mut node = ChangeNode::new("Device", label, "added");
            node.id = Some(device.id.clone());
            if let Some(ref pi) = device.plugin_info {
                node.context = Some(pi.plugin_name.clone());
            }
            changes.push(node);
        }
    }

    // Modified devices (matched by ID)
    for (id, new_device) in &new_map {
        if let Some(old_device) = old_map.get(id) {
            let device_children = diff_device(old_device, new_device);
            if !device_children.is_empty() {
                let label = if new_device.name.is_empty() {
                    &new_device.class_name
                } else {
                    &new_device.name
                };
                let mut node = ChangeNode::new("Device", label, "modified");
                node.id = Some(new_device.id.clone());
                node.children = device_children;
                changes.push(node);
            }
        }
    }

    changes
}

/// Diff a matched device pair.
fn diff_device(old: &Device, new: &Device) -> Vec<ChangeNode> {
    let mut children = Vec::new();

    // Active state change
    if old.is_active != new.is_active {
        let action = if new.is_active {
            "enabled"
        } else {
            "disabled"
        };
        children.push(ChangeNode::new("Device", &new.name, action));
    }

    // Name change
    if old.name != new.name && !old.name.is_empty() && !new.name.is_empty() {
        children.push(ChangeNode::value_change(
            "Property",
            "Device Name",
            &old.name,
            &new.name,
        ));
    }

    // Plugin info change
    match (&old.plugin_info, &new.plugin_info) {
        (Some(old_pi), Some(new_pi)) => {
            if old_pi.plugin_name != new_pi.plugin_name {
                children.push(ChangeNode::value_change(
                    "Plugin",
                    "Plugin",
                    &old_pi.plugin_name,
                    &new_pi.plugin_name,
                ));
            }
        }
        (None, Some(new_pi)) => {
            let mut node = ChangeNode::new("Plugin", &new_pi.plugin_name, "added");
            node.context = new_pi.format.clone();
            children.push(node);
        }
        (Some(old_pi), None) => {
            children.push(ChangeNode::new("Plugin", &old_pi.plugin_name, "removed"));
        }
        _ => {}
    }

    // Macro parameter changes
    let macro_changes = diff_macros(&old.macros, &new.macros);
    children.extend(macro_changes);

    // Recursive sub-chain diff (for rack devices)
    match (&old.sub_chains, &new.sub_chains) {
        (Some(old_branches), Some(new_branches)) => {
            let branch_changes = diff_branch_lists(old_branches, new_branches);
            children.extend(branch_changes);
        }
        (None, Some(new_branches)) => {
            for branch in new_branches {
                let mut node = ChangeNode::new("Branch", &branch.effective_name, "added");
                node.context = Some(branch.branch_type.clone());
                children.push(node);
            }
        }
        (Some(old_branches), None) => {
            for branch in old_branches {
                let mut node = ChangeNode::new("Branch", &branch.effective_name, "removed");
                node.context = Some(branch.branch_type.clone());
                children.push(node);
            }
        }
        _ => {}
    }

    children
}

// ─────────────────────────────────────────────
// Macro diff
// ─────────────────────────────────────────────

fn diff_macros(old: &[MacroParameter], new: &[MacroParameter]) -> Vec<ChangeNode> {
    let mut changes = Vec::new();

    let old_map: HashMap<u8, &MacroParameter> = old.iter().map(|m| (m.index, m)).collect();
    let new_map: HashMap<u8, &MacroParameter> = new.iter().map(|m| (m.index, m)).collect();

    for (index, new_macro) in &new_map {
        if let Some(old_macro) = old_map.get(index) {
            // Value changed?
            if (old_macro.value - new_macro.value).abs() > 0.001 {
                let label = format!("{} ({})", new_macro.name, new_macro.index);
                changes.push(ChangeNode::value_change(
                    "Parameter",
                    &label,
                    &format!("{:.2}", old_macro.value),
                    &format!("{:.2}", new_macro.value),
                ));
            }
        }
    }

    changes
}

// ─────────────────────────────────────────────
// Branch diff (recursive)
// ─────────────────────────────────────────────

fn diff_branch_lists(old: &[Branch], new: &[Branch]) -> Vec<ChangeNode> {
    let mut changes = Vec::new();

    // Match branches by name (branches don't have stable IDs)
    let old_by_name: HashMap<&str, &Branch> =
        old.iter().map(|b| (b.effective_name.as_str(), b)).collect();
    let new_by_name: HashMap<&str, &Branch> =
        new.iter().map(|b| (b.effective_name.as_str(), b)).collect();

    // Removed branches
    for (name, branch) in &old_by_name {
        if !new_by_name.contains_key(name) {
            let mut node = ChangeNode::new("Branch", name, "removed");
            node.context = Some(branch.branch_type.clone());
            changes.push(node);
        }
    }

    // Added branches
    for (name, branch) in &new_by_name {
        if !old_by_name.contains_key(name) {
            let mut node = ChangeNode::new("Branch", name, "added");
            node.context = Some(branch.branch_type.clone());
            changes.push(node);
        }
    }

    // Modified branches — recurse into device chains
    for (name, new_branch) in &new_by_name {
        if let Some(old_branch) = old_by_name.get(name) {
            let device_changes =
                diff_device_chain(&old_branch.device_chain, &new_branch.device_chain);
            if !device_changes.is_empty() {
                let mut node = ChangeNode::new("Branch", name, "modified");
                node.context = Some(new_branch.branch_type.clone());
                node.children = device_changes;
                changes.push(node);
            }
        }
    }

    changes
}

// ─────────────────────────────────────────────
// Routing diff
// ─────────────────────────────────────────────

fn diff_routing(old: &TrackRouting, new: &TrackRouting) -> Vec<ChangeNode> {
    let mut changes = Vec::new();

    // Output routing change
    if old.output_target != new.output_target
        && (!old.output_target.is_empty() || !new.output_target.is_empty())
    {
        changes.push(ChangeNode::value_change(
            "Routing",
            "Output Routing",
            &old.output_target,
            &new.output_target,
        ));
    }

    // Send changes
    let old_sends: HashMap<usize, &SendInfo> = old.sends.iter().map(|s| (s.send_index, s)).collect();
    let new_sends: HashMap<usize, &SendInfo> = new.sends.iter().map(|s| (s.send_index, s)).collect();

    for (idx, new_send) in &new_sends {
        if let Some(old_send) = old_sends.get(idx) {
            // Value change
            if (old_send.value - new_send.value).abs() > 0.001 {
                let label = format!("Send {}", send_letter(*idx));
                changes.push(ChangeNode::value_change(
                    "Send",
                    &label,
                    &format!("{:.3}", old_send.value),
                    &format!("{:.3}", new_send.value),
                ));
            }
            // Active state change
            if old_send.is_active != new_send.is_active {
                let label = format!("Send {}", send_letter(*idx));
                let action = if new_send.is_active {
                    "enabled"
                } else {
                    "disabled"
                };
                changes.push(ChangeNode::new("Send", &label, action));
            }
        } else {
            // New send
            let label = format!("Send {}", send_letter(*idx));
            changes.push(ChangeNode::new("Send", &label, "added"));
        }
    }

    changes
}

/// Convert send index to letter (0 -> A, 1 -> B, etc.)
fn send_letter(idx: usize) -> char {
    // Map 0..=25 to 'A'..='Z'; clamp any higher index to 'Z' to avoid overflow.
    if idx < 26 {
        (b'A' + idx as u8) as char
    } else {
        'Z'
    }
}

/// Compute the set of elements that belong to the Longest Common Subsequence
/// of two sequences. Elements in the LCS preserved their relative order across
/// both versions; elements outside it were genuinely reordered.
fn lcs_set<'a>(a: &[&'a str], b: &[&'a str]) -> HashSet<&'a str> {
    let m = a.len();
    let n = b.len();

    // Build DP table
    let mut dp = vec![vec![0u32; n + 1]; m + 1];
    for i in 1..=m {
        for j in 1..=n {
            if a[i - 1] == b[j - 1] {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = dp[i - 1][j].max(dp[i][j - 1]);
            }
        }
    }

    // Backtrack to collect the LCS elements
    let mut result = HashSet::new();
    let (mut i, mut j) = (m, n);
    while i > 0 && j > 0 {
        if a[i - 1] == b[j - 1] {
            result.insert(a[i - 1]);
            i -= 1;
            j -= 1;
        } else if dp[i - 1][j] >= dp[i][j - 1] {
            i -= 1;
        } else {
            j -= 1;
        }
    }

    result
}

// ─────────────────────────────────────────────
// Clip / Sample diff
// ─────────────────────────────────────────────

fn diff_clips(old: &[ClipSummary], new: &[ClipSummary]) -> Vec<ChangeNode> {
    let mut changes = Vec::new();

    // Clips don't have stable IDs yet (TODO: parse clip XML Id attribute).
    // Match in two passes before falling back to treating unmatched clips as
    // added/removed — this avoids the positional cascade where inserting one
    // clip makes every subsequent clip appear as "modified".
    //
    // Pass 1: match by non-empty name (most reliable when the user has named clips).
    // Pass 2: match remaining clips by (start_time, end_time) tuple.
    //         Note: this breaks if the user moves a clip; clip_id will fix that.
    // Remaining: unmatched old = removed, unmatched new = added.

    let clip_label = |clip: &ClipSummary, idx: usize| -> String {
        if !clip.name.is_empty() { clip.name.clone() } else { format!("Clip {}", idx + 1) }
    };

    let mut matched_old: HashSet<usize> = HashSet::new();
    let mut matched_new: HashSet<usize> = HashSet::new();

    // Pass 1: match by name
    for (oi, old_clip) in old.iter().enumerate() {
        if old_clip.name.is_empty() { continue; }
        if let Some(ni) = new.iter().enumerate().find_map(|(ni, nc)| {
            if !matched_new.contains(&ni) && nc.name == old_clip.name { Some(ni) } else { None }
        }) {
            matched_old.insert(oi);
            matched_new.insert(ni);
            let clip_changes = diff_single_clip(old_clip, &new[ni]);
            if !clip_changes.is_empty() {
                let mut node = ChangeNode::new("Clip", &clip_label(&new[ni], ni), "modified");
                node.children = clip_changes;
                changes.push(node);
            }
        }
    }

    // Pass 2: match remaining by (start_time, end_time)
    for (oi, old_clip) in old.iter().enumerate() {
        if matched_old.contains(&oi) { continue; }
        if let Some(ni) = new.iter().enumerate().find_map(|(ni, nc)| {
            if !matched_new.contains(&ni)
                && nc.start_time == old_clip.start_time
                && nc.end_time == old_clip.end_time
            { Some(ni) } else { None }
        }) {
            matched_old.insert(oi);
            matched_new.insert(ni);
            let clip_changes = diff_single_clip(old_clip, &new[ni]);
            if !clip_changes.is_empty() {
                let mut node = ChangeNode::new("Clip", &clip_label(&new[ni], ni), "modified");
                node.children = clip_changes;
                changes.push(node);
            }
        }
    }

    // Unmatched new = added
    for (ni, new_clip) in new.iter().enumerate() {
        if !matched_new.contains(&ni) {
            changes.push(ChangeNode::new("Clip", &clip_label(new_clip, ni), "added"));
        }
    }

    // Unmatched old = removed
    for (oi, old_clip) in old.iter().enumerate() {
        if !matched_old.contains(&oi) {
            changes.push(ChangeNode::new("Clip", &clip_label(old_clip, oi), "removed"));
        }
    }

    changes
}

fn diff_single_clip(old: &ClipSummary, new: &ClipSummary) -> Vec<ChangeNode> {
    let mut changes = Vec::new();

    if old.name != new.name && !old.name.is_empty() && !new.name.is_empty() {
        changes.push(ChangeNode::value_change(
            "Property",
            "Clip Name",
            &old.name,
            &new.name,
        ));
    }

    // Sample reference diff — CRC-based identity
    match (&old.sample_ref, &new.sample_ref) {
        (Some(old_sr), Some(new_sr)) => {
            if old_sr.original_crc != new_sr.original_crc {
                // CRC changed = sample content replaced, even if filename is the same
                let mut node = ChangeNode::new("Sample", &new_sr.name, "sample_replaced");
                node.from = Some(format!(
                    "{} (CRC: {})",
                    old_sr.name, old_sr.original_crc
                ));
                node.to = Some(format!(
                    "{} (CRC: {})",
                    new_sr.name, new_sr.original_crc
                ));
                changes.push(node);
            } else if old_sr.relative_path != new_sr.relative_path {
                // Same CRC but different path = file moved/renamed on disk
                changes.push(ChangeNode::value_change(
                    "Sample",
                    "Sample Path",
                    &old_sr.relative_path,
                    &new_sr.relative_path,
                ));
            }
        }
        (None, Some(new_sr)) => {
            changes.push(ChangeNode::new("Sample", &new_sr.name, "added"));
        }
        (Some(old_sr), None) => {
            changes.push(ChangeNode::new("Sample", &old_sr.name, "removed"));
        }
        _ => {}
    }

    changes
}
