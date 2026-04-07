//! XML-level merge for Ableton Live Set (.als) files.
//!
//! Operates on raw XML bytes so that all data (automation, plugin state, warp
//! markers, etc.) survives the round-trip — the semantic `Project` struct only
//! captures a subset and cannot reconstruct a full `.als`.
//!
//! High-level flow:
//!   1. Decompress both files (gzip auto-detected).
//!   2. Split each into (prefix, Vec<RawTrack>, suffix) around <Tracks>.
//!   3. Merge track lists: remote is authority; local edits to shared tracks
//!      replace the remote copy; local-only tracks are appended.
//!   4. Resolve duplicate track IDs that can arise when two users independently
//!      add tracks (Ableton assigns sequential integers).
//!   5. Reassemble XML and gzip-compress.

use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};

use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/// A track element captured as raw XML bytes together with its identity.
#[derive(Clone)]
struct RawTrack {
    /// The `Id` attribute value from the opening tag (e.g. "5").
    id: String,
    /// The complete XML bytes for this track element, from opening to closing tag.
    raw_bytes: Vec<u8>,
}

/// The three logical sections of an `.als` file around the `<Tracks>` element.
struct AlsSections {
    /// Everything before `<Tracks>` (inclusive of the `<Tracks>` opening tag is
    /// stripped — we re-emit it ourselves so prefix ends right before it).
    prefix: Vec<u8>,
    /// Individual track elements.
    tracks: Vec<RawTrack>,
    /// Everything after `</Tracks>` (the closing tag itself is stripped).
    suffix: Vec<u8>,
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/// Merge two `.als` files at the XML track level.
///
/// * `local_bytes`  — User B's uncommitted `.als` (their in-progress edits).
/// * `remote_bytes` — User A's `.als` (current HEAD after rebase).
///
/// Returns gzip-compressed bytes ready to be written back as a `.als` file.
pub fn merge_als(local_bytes: &[u8], remote_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let local_xml = decompress_if_needed(local_bytes)?;
    let remote_xml = decompress_if_needed(remote_bytes)?;

    let local_sections = split_als_sections(&local_xml)?;
    let remote_sections = split_als_sections(&remote_xml)?;

    let mut merged_tracks = merge_tracks(local_sections.tracks, remote_sections.tracks);
    resolve_track_id_conflicts(&mut merged_tracks);

    // Use the remote prefix/suffix (they reflect the rebased HEAD state for
    // project-level metadata like tempo, time signature, etc.).
    let mut merged_xml = reassemble_to_vec(&remote_sections.prefix, &merged_tracks, &remote_sections.suffix);

    let local_s = std::str::from_utf8(&local_xml)
        .map_err(|_| "Local ALS is not valid UTF-8 (required for NextPointeeId fix)".to_string())?;
    let remote_s = std::str::from_utf8(&remote_xml)
        .map_err(|_| "Remote ALS is not valid UTF-8 (required for NextPointeeId fix)".to_string())?;

    patch_next_pointee_id_for_merge(local_s, remote_s, &mut merged_xml)?;

    compress_gzip(&merged_xml)
}

// ─────────────────────────────────────────────
// Decompression
// ─────────────────────────────────────────────

fn decompress_if_needed(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() >= 2 && data[0] == 0x1f && data[1] == 0x8b {
        let mut decoder = GzDecoder::new(data);
        let mut out = Vec::new();
        decoder
            .read_to_end(&mut out)
            .map_err(|e| format!("Gzip decompression failed: {}", e))?;
        Ok(out)
    } else {
        Ok(data.to_vec())
    }
}

// ─────────────────────────────────────────────
// XML splitting
// ─────────────────────────────────────────────

/// Split decompressed `.als` XML into prefix, tracks, and suffix.
///
/// Uses byte-level scanning with `quick_xml` so we capture each track element's
/// raw bytes verbatim (preserving whitespace, attributes, nested content, etc.).
fn split_als_sections(xml: &[u8]) -> Result<AlsSections, String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_reader(xml);
    let mut buf = Vec::new();

    // Phase 1: find the byte offset of the <Tracks> opening tag.
    let tracks_start: usize;
    loop {
        let pos = reader.buffer_position();
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) if e.name().as_ref() == b"Tracks" => {
                tracks_start = pos;
                break;
            }
            Ok(Event::Eof) => {
                return Err("No <Tracks> element found in ALS file".to_string());
            }
            Err(e) => {
                return Err(format!("XML parse error before <Tracks>: {}", e));
            }
            _ => {}
        }
        buf.clear();
    }

    let prefix = xml[..tracks_start].to_vec();

    // Phase 2: read each direct child of <Tracks> as a raw track.
    let mut tracks: Vec<RawTrack> = Vec::new();
    let mut depth = 1u32; // we're inside <Tracks>

    buf.clear();
    loop {
        let child_start = reader.buffer_position();
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                if depth == 2 && is_track_element(e.name().as_ref()) {
                    let tag_name = e.name().as_ref().to_vec();
                    let id = extract_id_attr(e);

                    // Consume until the matching closing tag.
                    let mut inner_depth = 1u32;
                    let mut inner_buf = Vec::new();
                    loop {
                        match reader.read_event_into(&mut inner_buf) {
                            Ok(Event::Start(_)) => inner_depth += 1,
                            Ok(Event::End(ref end_e)) => {
                                inner_depth -= 1;
                                if inner_depth == 0 && end_e.name().as_ref() == tag_name.as_slice()
                                {
                                    break;
                                }
                            }
                            Ok(Event::Eof) => break,
                            Err(_) => break,
                            _ => {}
                        }
                        inner_buf.clear();
                    }

                    let child_end = reader.buffer_position();
                    let raw = xml[child_start..child_end].to_vec();

                    tracks.push(RawTrack {
                        id: id.unwrap_or_default(),
                        raw_bytes: raw,
                    });

                    depth -= 1; // the closing tag brought us back to depth 1
                } else if depth == 2 {
                    // Direct child of <Tracks> that is not a *Track element (e.g. extension
                    // metadata). Consume the whole subtree so outer depth stays aligned with the
                    // document; otherwise the next events desync and byte slices are wrong.
                    let name = e.name().as_ref().to_vec();
                    skip_subtree(&mut reader, &mut buf, name.as_slice())?;
                    depth -= 1;
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if depth == 0 && e.name().as_ref() == b"Tracks" {
                    let suffix_start = reader.buffer_position();
                    let suffix = xml[suffix_start..].to_vec();
                    return Ok(AlsSections {
                        prefix,
                        tracks,
                        suffix,
                    });
                }
            }
            Ok(Event::Eof) => {
                return Err("Unexpected EOF inside <Tracks>".to_string());
            }
            Err(e) => {
                return Err(format!("XML parse error inside <Tracks>: {}", e));
            }
            _ => {}
        }
        buf.clear();
    }
}

/// Extract the `Id` attribute from an XML start event.
fn extract_id_attr(event: &quick_xml::events::BytesStart<'_>) -> Option<String> {
    event
        .try_get_attribute(b"Id")
        .ok()
        .flatten()
        .map(|a| String::from_utf8_lossy(&a.value).into_owned())
}

/// Ableton uses several `*Track` element names (AudioTrack, MidiTrack, HybridTrack, …).
fn is_track_element(name: &[u8]) -> bool {
    name.len() >= 5 && name.ends_with(b"Track")
}

/// After the opening `Start` of a non-track direct child of `<Tracks>` has been consumed,
/// skip until the matching end tag so the outer parser stays aligned with the document.
fn skip_subtree(
    reader: &mut quick_xml::Reader<&[u8]>,
    buf: &mut Vec<u8>,
    end_name: &[u8],
) -> Result<(), String> {
    use quick_xml::events::Event;
    let mut depth = 1u32;
    loop {
        match reader.read_event_into(buf) {
            Ok(Event::Start(_)) => depth += 1,
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if depth == 0 && e.name().as_ref() == end_name {
                    return Ok(());
                }
            }
            Ok(Event::Empty(_)) => {}
            Ok(Event::Eof) => {
                return Err("Unexpected EOF while skipping XML subtree".to_string());
            }
            Err(e) => {
                return Err(format!("XML parse error while skipping subtree: {}", e));
            }
            _ => {}
        }
        buf.clear();
    }
}

// ─────────────────────────────────────────────
// Track merging
// ─────────────────────────────────────────────

/// Merge local and remote track lists.
///
/// Strategy:
/// - Start with remote tracks as the base (authoritative post-rebase state).
/// - For each local track whose ID matches a remote track, replace the remote
///   copy with the local one (preserving User B's edits to existing tracks).
/// - Append any local-only tracks (new tracks User B created) at the end.
fn merge_tracks(local: Vec<RawTrack>, remote: Vec<RawTrack>) -> Vec<RawTrack> {
    // Same track count and matching Id per slot (including empty-empty): lists agree on
    // structure — use local bytes entirely (equivalent to per-id replacement without
    // HashMap pitfalls for empty ids).
    if local.len() == remote.len() && local.iter().zip(remote.iter()).all(|(a, b)| a.id == b.id) {
        return local;
    }

    let remote_ids: HashSet<String> = remote.iter().map(|t| t.id.clone()).collect();

    // Only non-empty ids are safe in a map; empty ids would all alias to the same key.
    let local_by_id: HashMap<String, RawTrack> = local
        .iter()
        .filter(|t| !t.id.is_empty())
        .map(|t| (t.id.clone(), t.clone()))
        .collect();

    let mut merged: Vec<RawTrack> = Vec::with_capacity(remote.len());
    for (i, remote_track) in remote.into_iter().enumerate() {
        let replacement = if !remote_track.id.is_empty() {
            local_by_id.get(&remote_track.id)
        } else {
            local.get(i).filter(|lt| lt.id.is_empty())
        };

        merged.push(match replacement {
            Some(lt) => RawTrack {
                id: lt.id.clone(),
                raw_bytes: lt.raw_bytes.clone(),
            },
            None => remote_track,
        });
    }

    // Append local-only tracks (non-empty IDs not present on remote).
    let mut local_only: Vec<RawTrack> = local
        .into_iter()
        .filter(|t| !t.id.is_empty() && !remote_ids.contains(&t.id))
        .collect();

    local_only.sort_by(|a, b| {
        let a_num: i64 = a.id.parse().unwrap_or(i64::MAX);
        let b_num: i64 = b.id.parse().unwrap_or(i64::MAX);
        a_num.cmp(&b_num)
    });

    merged.extend(local_only);
    merged
}

// ─────────────────────────────────────────────
// Track ID conflict resolution
// ─────────────────────────────────────────────

/// Find and resolve duplicate track IDs.
///
/// Ableton assigns sequential integer IDs. When two users independently add
/// tracks, they can end up with the same ID. We keep the first occurrence and
/// renumber subsequent duplicates to `max_id + 1, max_id + 2, …`.
fn resolve_track_id_conflicts(tracks: &mut Vec<RawTrack>) {
    let mut seen: HashSet<String> = HashSet::new();
    let mut duplicates: Vec<usize> = Vec::new();

    for (i, track) in tracks.iter().enumerate() {
        if !seen.insert(track.id.clone()) {
            duplicates.push(i);
        }
    }

    if duplicates.is_empty() {
        return;
    }

    // Find the maximum numeric ID across all tracks.
    let max_id: i64 = tracks
        .iter()
        .filter_map(|t| t.id.parse::<i64>().ok())
        .max()
        .unwrap_or(0);

    let mut next_id = max_id + 1;

    for idx in duplicates {
        let old_id = tracks[idx].id.clone();
        let new_id = next_id.to_string();
        next_id += 1;

        // Replace the Id attribute in the opening tag's raw bytes.
        let old_attr = format!("Id=\"{}\"", old_id);
        let new_attr = format!("Id=\"{}\"", new_id);

        // Only replace the first occurrence (the opening tag attribute), not
        // any child elements that might coincidentally contain the same string.
        if let Some(pos) = find_bytes(&tracks[idx].raw_bytes, old_attr.as_bytes()) {
            let mut patched = Vec::with_capacity(tracks[idx].raw_bytes.len() + new_attr.len());
            patched.extend_from_slice(&tracks[idx].raw_bytes[..pos]);
            patched.extend_from_slice(new_attr.as_bytes());
            patched.extend_from_slice(&tracks[idx].raw_bytes[pos + old_attr.len()..]);
            tracks[idx].raw_bytes = patched;
        }

        tracks[idx].id = new_id;
    }
}

/// Find the byte offset of `needle` in `haystack`, or `None`.
fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || needle.len() > haystack.len() {
        return None;
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

// ─────────────────────────────────────────────
// NextPointeeId (Ableton internal graph IDs)
// ─────────────────────────────────────────────

/// Read `<NextPointeeId Value="N"/>` from a full Live Set XML string.
fn extract_next_pointee_id(xml: &str) -> Option<u64> {
    let key = "NextPointeeId";
    let idx = xml.find(key)?;
    let tail = &xml[idx..];
    let vkey = "Value=\"";
    let vstart = tail.find(vkey)? + vkey.len();
    let rest = &tail[vstart..];
    let end = rest.find('"')?;
    rest[..end].parse().ok()
}

/// Scan merged XML for `<Pointee` … `Id="N"` style references and return the
/// largest `N` seen. Ableton requires `NextPointeeId` to be strictly greater
/// than every in-use pointee id — merging local track XML under a remote header
/// can violate that if the remote header's counter is lower.
///
/// We match `<Pointee` (not `NextPointeeId`) so we do not mis-parse the header.
fn max_pointee_id_in_merged_xml(xml: &str) -> u64 {
    let mut max_id = 0u64;
    let mut search_from = 0;
    while let Some(rel) = xml[search_from..].find("<Pointee") {
        let pos = search_from + rel;
        let window_end = (pos + 800).min(xml.len());
        let window = &xml[pos..window_end];
        if let Some(id_rel) = window.find("Id=\"") {
            let start = pos + id_rel + "Id=\"".len();
            let rest = &xml[start..];
            if let Some(end_rel) = rest.find('"') {
                if let Ok(n) = rest[..end_rel].parse::<u64>() {
                    max_id = max_id.max(n);
                }
            }
        }
        search_from = pos + 9;
    }
    max_id
}

/// After tracks are merged, ensure `<NextPointeeId Value="…"/>` exceeds every
/// pointee id in the document and is at least as large as both source files'
/// counters.
fn patch_next_pointee_id_for_merge(
    local_full: &str,
    remote_full: &str,
    merged_xml: &mut Vec<u8>,
) -> Result<(), String> {
    let l = extract_next_pointee_id(local_full).unwrap_or(0);
    let r = extract_next_pointee_id(remote_full).unwrap_or(0);

    let merged_utf8 = std::str::from_utf8(merged_xml)
        .map_err(|_| "Merged ALS is not valid UTF-8".to_string())?;
    let max_pointee = max_pointee_id_in_merged_xml(merged_utf8);

    // NextPointeeId must be > max assigned pointee id in the set.
    let mut target = l.max(r);
    if max_pointee > 0 {
        target = target.max(max_pointee.saturating_add(1));
    }

    if target == 0 {
        return Ok(());
    }

    let mut s = merged_utf8.to_string();

    let key = "NextPointeeId";
    let Some(idx) = s.find(key) else {
        return Ok(());
    };
    let vkey = "Value=\"";
    let tail = &s[idx..];
    let Some(vrel) = tail.find(vkey) else {
        return Ok(());
    };
    let abs_start = idx + vrel + vkey.len();
    let rest = &s[abs_start..];
    let Some(end_rel) = rest.find('"') else {
        return Ok(());
    };
    let abs_end = abs_start + end_rel;
    s.replace_range(abs_start..abs_end, &target.to_string());

    *merged_xml = s.into_bytes();
    Ok(())
}

// ─────────────────────────────────────────────
// Reassembly + compression
// ─────────────────────────────────────────────

/// Reassemble the merged `.als` XML (uncompressed UTF-8 bytes).
fn reassemble_to_vec(prefix: &[u8], tracks: &[RawTrack], suffix: &[u8]) -> Vec<u8> {
    let mut xml = Vec::new();
    xml.extend_from_slice(prefix);
    xml.extend_from_slice(b"<Tracks>\n");
    for track in tracks {
        xml.extend_from_slice(&track.raw_bytes);
        xml.push(b'\n');
    }
    xml.extend_from_slice(b"</Tracks>\n");
    xml.extend_from_slice(suffix);
    xml
}

fn compress_gzip(xml: &[u8]) -> Result<Vec<u8>, String> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(xml)
        .map_err(|e| format!("Gzip compression failed: {}", e))?;
    encoder
        .finish()
        .map_err(|e| format!("Gzip finalization failed: {}", e))
}
