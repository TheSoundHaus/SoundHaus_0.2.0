//! Three-way ALS merge: BASE (pre-pull committed), LOCAL (WIP backup), REMOTE (post-rebase).

use crate::merge::{
    compress_gzip, decompress_if_needed, max_lom_id_scan, patch_next_pointee_id_for_merge,
    reassemble_to_vec, remap_all_lom_ids_in_duplicated_track, resolve_track_id_conflicts,
    split_als_sections, RawTrack,
};
use crate::models::{ClipSummary, MidiNote, Project, Track};
use crate::parser;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

const BEAT_EPS: f64 = 1e-4;

#[derive(Debug, Serialize)]
pub struct AlsMergeConflictEntry {
    pub track_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_name: Option<String>,
    pub conflict_kind: String,
    pub summary: String,
}

#[derive(Debug, Serialize)]
pub struct AlsMergeConflictReport {
    pub ok: bool,
    pub conflicts: Vec<AlsMergeConflictEntry>,
}

#[derive(Debug, Deserialize)]
struct ResolutionInput {
    #[serde(flatten)]
    choices: HashMap<String, String>,
}

fn tracks_by_id<'a>(p: &'a Project) -> HashMap<String, &'a Track> {
    p.tracks
        .iter()
        .filter(|t| !t.id.is_empty())
        .map(|t| (t.id.clone(), t))
        .collect()
}

fn raw_tracks_by_id(tracks: &[RawTrack]) -> HashMap<String, RawTrack> {
    tracks
        .iter()
        .filter(|t| !t.id.is_empty())
        .map(|t| (t.id.clone(), t.clone()))
        .collect()
}

pub fn clip_fingerprint(c: &ClipSummary) -> String {
    if let Some(id) = &c.clip_id {
        // `Id="0"` is often a Live placeholder; treating it as stable breaks slot XML lookup / merging.
        if !id.is_empty() && id != "0" {
            return format!("id:{}", id);
        }
    }
    match c.clip_type.as_deref() {
        Some("AudioClip") => {
            let (path, crc) = c
                .sample_ref
                .as_ref()
                .map(|s| (s.relative_path.as_str(), s.original_crc.as_str()))
                .unwrap_or(("", ""));
            format!("audio:{}:{}:{}:{}", path, crc, c.start_time, c.end_time)
        }
        Some("MidiClip") => {
            let mut parts: Vec<String> = c
                .midi_notes
                .iter()
                .map(|n| {
                    format!(
                        "{}@{:.6}+{:.6}",
                        n.pitch, n.start_beat, n.duration_beats
                    )
                })
                .collect();
            parts.sort();
            format!("midi:{}:{}:{}", parts.join(","), c.start_time, c.end_time)
        }
        _ => format!("other:{}:{}:{}", c.name, c.start_time, c.end_time),
    }
}

fn intervals_overlap_arrangement(a0: f64, a1: f64, b0: f64, b1: f64) -> bool {
    let (a_lo, a_hi) = if a0 <= a1 { (a0, a1) } else { (a1, a0) };
    let (b_lo, b_hi) = if b0 <= b1 { (b0, b1) } else { (b1, b0) };
    !(a_hi < b_lo - BEAT_EPS || b_hi < a_lo - BEAT_EPS)
}

fn midi_notes_overlap(na: &[MidiNote], nb: &[MidiNote]) -> bool {
    for a in na {
        for b in nb {
            if a.pitch != b.pitch {
                continue;
            }
            let a1 = a.start_beat + a.duration_beats;
            let b1 = b.start_beat + b.duration_beats;
            if intervals_overlap_arrangement(a.start_beat, a1, b.start_beat, b1) {
                return true;
            }
        }
    }
    false
}

fn note_time_matches(a: &MidiNote, b: &MidiNote) -> bool {
    a.pitch == b.pitch
        && (a.start_beat - b.start_beat).abs() < BEAT_EPS
        && (a.duration_beats - b.duration_beats).abs() < BEAT_EPS
}

fn midi_notes_not_matching_base(notes: &[MidiNote], base: &[MidiNote]) -> Vec<MidiNote> {
    notes
        .iter()
        .filter(|n| !base.iter().any(|b| note_time_matches(n, b)))
        .cloned()
        .collect()
}

fn arrangement_from_slot_xml(slot: &[u8]) -> Option<(f64, f64)> {
    let s = std::str::from_utf8(slot).ok()?;
    fn read_value_after_key(s: &str, key: &str) -> Option<f64> {
        let i = s.find(key)?;
        let tail = &s[i + key.len()..];
        let v = tail.find("Value=\"")?;
        let tail = &tail[v + "Value=\"".len()..];
        let end = tail.find('"')?;
        tail[..end].parse().ok()
    }
    let start = read_value_after_key(s, "CurrentStart")?;
    let end = read_value_after_key(s, "CurrentEnd")?;
    Some((start, end))
}

fn slots_for_arrangement_matches(
    local_track: &[u8],
    clips: &[&ClipSummary],
) -> Result<Vec<Vec<u8>>, String> {
    if clips.is_empty() {
        return Ok(Vec::new());
    }
    let slots = extract_clip_slots_xml(local_track)?;
    let mut out = Vec::with_capacity(clips.len());
    for clip in clips {
        let mut found = false;
        for slot in &slots {
            if let Some((st, en)) = arrangement_from_slot_xml(slot) {
                if (st - clip.start_time).abs() < BEAT_EPS
                    && (en - clip.end_time).abs() < BEAT_EPS
                {
                    out.push(slot.clone());
                    found = true;
                    break;
                }
            }
        }
        if !found {
            return Err(format!(
                "No ClipSlot for local MIDI clip at {:.6}-{:.6}",
                clip.start_time, clip.end_time
            ));
        }
    }
    Ok(out)
}

fn merge_disjoint_midi_slots(
    local_raw: &RawTrack,
    remote_raw: &RawTrack,
    local_clips: &[&ClipSummary],
) -> Result<Option<RawTrack>, String> {
    if local_clips.is_empty() {
        return Ok(None);
    }
    let slots = slots_for_arrangement_matches(&local_raw.raw_bytes, local_clips)?;
    let merged_bytes = insert_before_clipslotlist_close(&remote_raw.raw_bytes, &slots)?;
    Ok(Some(RawTrack {
        id: remote_raw.id.clone(),
        raw_bytes: merged_bytes,
    }))
}

fn disjoint_unstable_midi_parallel_ok(
    local_added: &[&ClipSummary],
    remote_added: &[&ClipSummary],
) -> bool {
    if local_added.is_empty() || remote_added.is_empty() {
        return false;
    }
    if !local_added.iter().all(|c| {
        matches!(c.clip_id.as_deref(), None | Some("") | Some("0"))
            && c.clip_type.as_deref() == Some("MidiClip")
    }) {
        return false;
    }
    if !remote_added
        .iter()
        .all(|c| c.clip_type.as_deref() == Some("MidiClip"))
    {
        return false;
    }
    for lc in local_added {
        for rc in remote_added {
            if intervals_overlap_arrangement(
                lc.start_time,
                lc.end_time,
                rc.start_time,
                rc.end_time,
            ) {
                return false;
            }
        }
    }
    true
}

fn resolve_base_clip_for_pair<'a>(
    btrack: &'a Track,
    lc: &ClipSummary,
    rc: &ClipSummary,
) -> Option<&'a ClipSummary> {
    match (lc.clip_id.as_deref(), rc.clip_id.as_deref()) {
        (Some(lid), Some(rid)) if !lid.is_empty() && lid != "0" && lid == rid => {
            btrack.clips.iter().find(|c| c.clip_id.as_deref() == Some(lid))
        }
        _ => {
            let cand: Vec<&ClipSummary> = btrack
                .clips
                .iter()
                .filter(|b| {
                    b.clip_type.as_deref() == Some("MidiClip")
                        && intervals_overlap_arrangement(
                            b.start_time,
                            b.end_time,
                            lc.start_time,
                            lc.end_time,
                        )
                        && intervals_overlap_arrangement(
                            b.start_time,
                            b.end_time,
                            rc.start_time,
                            rc.end_time,
                        )
                })
                .collect();
            if cand.len() != 1 {
                return None;
            }
            Some(cand[0])
        }
    }
}

fn clips_conflict_pair_with_base(btrack: &Track, lc: &ClipSummary, rc: &ClipSummary) -> bool {
    if clip_fingerprint(lc) == clip_fingerprint(rc) {
        return false;
    }

    if lc.clip_type.as_deref() == Some("MidiClip") && rc.clip_type.as_deref() == Some("MidiClip") {
        if let Some(bc) = resolve_base_clip_for_pair(btrack, lc, rc) {
            if bc.clip_type.as_deref() == Some("MidiClip") {
                let local_delta = midi_notes_not_matching_base(&lc.midi_notes, &bc.midi_notes);
                let remote_delta = midi_notes_not_matching_base(&rc.midi_notes, &bc.midi_notes);
                if local_delta.is_empty() || remote_delta.is_empty() {
                    return false;
                }
                let (la, ha) = (lc.start_time, lc.end_time);
                let (lb, hb) = (rc.start_time, rc.end_time);
                let degenerate =
                    la == 0.0 && ha == 0.0 && lb == 0.0 && hb == 0.0;
                if !degenerate
                    && !intervals_overlap_arrangement(la, ha, lb, hb)
                {
                    return false;
                }
                return midi_notes_overlap(&local_delta, &remote_delta);
            }
        }
    }

    clips_conflict_pair(lc, rc)
}

fn detect_overlapping_midi_edits_same_clip(
    btrack: &Track,
    ltrack: &Track,
    rtrack: &Track,
    track_id: &str,
) -> Option<AlsMergeConflictEntry> {
    for lc in &ltrack.clips {
        let Some(lid) = lc.clip_id.as_deref() else {
            continue;
        };
        if lid.is_empty() || lid == "0" {
            continue;
        }
        if lc.clip_type.as_deref() != Some("MidiClip") {
            continue;
        }
        let Some(rc) = rtrack
            .clips
            .iter()
            .find(|c| c.clip_id.as_deref() == Some(lid))
        else {
            continue;
        };
        if rc.clip_type.as_deref() != Some("MidiClip") {
            continue;
        }
        let Some(bc) = btrack
            .clips
            .iter()
            .find(|c| c.clip_id.as_deref() == Some(lid))
        else {
            continue;
        };
        if bc.clip_type.as_deref() != Some("MidiClip") {
            continue;
        }
        if clip_fingerprint(lc) == clip_fingerprint(rc) {
            continue;
        }
        let local_delta = midi_notes_not_matching_base(&lc.midi_notes, &bc.midi_notes);
        let remote_delta = midi_notes_not_matching_base(&rc.midi_notes, &bc.midi_notes);
        if local_delta.is_empty() || remote_delta.is_empty() {
            continue;
        }
        if !intervals_overlap_arrangement(lc.start_time, lc.end_time, rc.start_time, rc.end_time) {
            continue;
        }
        if !midi_notes_overlap(&local_delta, &remote_delta) {
            continue;
        }
        return Some(AlsMergeConflictEntry {
            track_id: track_id.to_string(),
            track_name: Some(ltrack.effective_name.clone()),
            conflict_kind: "clips".into(),
            summary: "Overlapping clip or MIDI changes versus the common ancestor — choose Remote, Local, or Duplicate track."
                .into(),
        });
    }
    None
}

fn clips_conflict_pair(lc: &ClipSummary, rc: &ClipSummary) -> bool {
    let (la, ha) = (lc.start_time, lc.end_time);
    let (lb, hb) = (rc.start_time, rc.end_time);
    let degenerate = la == 0.0 && ha == 0.0 && lb == 0.0 && hb == 0.0;
    if degenerate {
        if lc.clip_type.as_deref() == Some("MidiClip") && rc.clip_type.as_deref() == Some("MidiClip")
        {
            return midi_notes_overlap(&lc.midi_notes, &rc.midi_notes);
        }
        return lc.clip_type.as_deref() == Some("MidiClip")
            && rc.clip_type.as_deref() == Some("MidiClip");
    }
    if !intervals_overlap_arrangement(la, ha, lb, hb) {
        return false;
    }
    if lc.clip_type.as_deref() == Some("MidiClip") && rc.clip_type.as_deref() == Some("MidiClip") {
        return midi_notes_overlap(&lc.midi_notes, &rc.midi_notes);
    }
    true
}

fn detect_conflicts(base: &Project, local: &Project, remote: &Project) -> Vec<AlsMergeConflictEntry> {
    let mut out = Vec::new();
    let bt = tracks_by_id(base);
    let lt = tracks_by_id(local);
    let rt = tracks_by_id(remote);
    for (id, btrack) in &bt {
        let Some(ltrack) = lt.get(id) else { continue };
        let Some(rtrack) = rt.get(id) else { continue };
        let base_fp: HashSet<_> = btrack.clips.iter().map(clip_fingerprint).collect();
        let local_added: Vec<&ClipSummary> = ltrack
            .clips
            .iter()
            .filter(|c| !base_fp.contains(&clip_fingerprint(*c)))
            .collect();
        let remote_added: Vec<&ClipSummary> = rtrack
            .clips
            .iter()
            .filter(|c| !base_fp.contains(&clip_fingerprint(*c)))
            .collect();
        if local_added.is_empty() || remote_added.is_empty() {
            continue;
        }
        // Same gate as `merge_shared_track`: parallel adds need per-track UI when local clips
        // lack a stable Lom Id (empty / "0"). Otherwise merge returns Err and NAPI throws
        // instead of `conflictJson`, so the desktop ALS modal never opens.
        let local_has_unstable_clip_id = local_added.iter().any(|c| {
            matches!(
                c.clip_id.as_deref(),
                None | Some("") | Some("0")
            )
        });
        if local_has_unstable_clip_id {
            let disjoint_midi = disjoint_unstable_midi_parallel_ok(&local_added, &remote_added);
            if !disjoint_midi {
                out.push(AlsMergeConflictEntry {
                    track_id: id.clone(),
                    track_name: Some(ltrack.effective_name.clone()),
                    conflict_kind: "parallel_unstable_clip_id".into(),
                    summary:
                        "Parallel clip additions without a stable clip Id in your version cannot be merged automatically — choose Remote, Local, or Duplicate track."
                            .into(),
                });
                continue;
            }
            // Disjoint MIDI-only adds without stable Id: `merge_shared_track` can splice by arrangement.
        }
        let mut hit = false;
        'outer: for lc in &local_added {
            for rc in &remote_added {
                if clip_fingerprint(lc) == clip_fingerprint(rc) {
                    continue;
                }
                if clips_conflict_pair_with_base(btrack, lc, rc) {
                    hit = true;
                    break 'outer;
                }
            }
        }
        if hit {
            out.push(AlsMergeConflictEntry {
                track_id: id.clone(),
                track_name: Some(ltrack.effective_name.clone()),
                conflict_kind: "clips".into(),
                summary: "Overlapping clip or MIDI changes versus the common ancestor — choose Remote, Local, or Duplicate track."
                    .into(),
            });
        }
    }

    // Tracks in both local and remote but not in base: `merge_shared_track` uses an empty
    // `base_fp`, so every clip is treated as added on both sides. The base-only loop above
    // never visits these ids — without this pass we hit `merge_shared_track`'s hard `Err`
    // (H3) and NAPI throws instead of returning `conflictJson`.
    for id in lt.keys() {
        if bt.contains_key(id) {
            continue;
        }
        let Some(ltrack) = lt.get(id) else {
            continue;
        };
        let Some(rtrack) = rt.get(id) else {
            continue;
        };
        if ltrack.clips.is_empty() || rtrack.clips.is_empty() {
            continue;
        }
        let local_has_unstable_clip_id = ltrack
            .clips
            .iter()
            .any(|c| matches!(c.clip_id.as_deref(), None | Some("") | Some("0")));
        if !local_has_unstable_clip_id {
            continue;
        }
        let local_refs: Vec<&ClipSummary> = ltrack.clips.iter().collect();
        let remote_refs: Vec<&ClipSummary> = rtrack.clips.iter().collect();
        if disjoint_unstable_midi_parallel_ok(&local_refs, &remote_refs) {
            continue;
        }
        out.push(AlsMergeConflictEntry {
            track_id: id.clone(),
            track_name: Some(ltrack.effective_name.clone()),
            conflict_kind: "parallel_unstable_clip_id".into(),
            summary:
                "Parallel clip additions without a stable clip Id in your version cannot be merged automatically — choose Remote, Local, or Duplicate track."
                    .into(),
        });
    }

    // `clip_fingerprint` is `id:N` for stable Ids, so MIDI edits don't surface as "added" clips.
    // Detect same-clip concurrent edits where *changes vs base* overlap in note space.
    for (tid, btrack) in &bt {
        if out.iter().any(|e| e.track_id == *tid) {
            continue;
        }
        let Some(ltrack) = lt.get(tid) else {
            continue;
        };
        let Some(rtrack) = rt.get(tid) else {
            continue;
        };
        if let Some(entry) =
            detect_overlapping_midi_edits_same_clip(btrack, ltrack, rtrack, tid.as_str())
        {
            out.push(entry);
        }
    }

    out
}

fn normalize_choice(s: &str) -> Option<&'static str> {
    match s.to_ascii_lowercase().as_str() {
        "remote" | "theirs" => Some("remote"),
        "local" | "mine" => Some("local"),
        "duplicate" => Some("duplicate"),
        _ => None,
    }
}

/// Read `Id` from the **opening tag** only (matches `parser::get_id` on `MidiClip` / `AudioClip`).
/// Scanning the whole `ClipSlot` would pick nested `Id="…"` (e.g. devices) and break lookups for
/// clips like `Id="0"`.
fn try_clip_id_from_slot(slot: &[u8]) -> Option<String> {
    fn opening_tag_id(slot: &[u8], needle: &[u8]) -> Option<String> {
        let rel = slot.windows(needle.len()).position(|w| w == needle)?;
        let mut i = rel + needle.len();
        let mut in_quote = false;
        while i < slot.len() {
            match slot[i] {
                b'"' => in_quote = !in_quote,
                b'>' if !in_quote => {
                    let open = std::str::from_utf8(&slot[rel..=i]).ok()?;
                    let key = "Id=\"";
                    let p = open.find(key)?;
                    let rest = &open[p + key.len()..];
                    let end = rest.find('"')?;
                    return Some(rest[..end].to_string());
                }
                _ => {}
            }
            i += 1;
        }
        None
    }
    opening_tag_id(slot, b"<MidiClip ")
        .or_else(|| opening_tag_id(slot, b"<AudioClip "))
}

/// Each `ClipSlot` element inside `MainSequencer` / `ClipSlotList`.
fn extract_clip_slots_xml(track_xml: &[u8]) -> Result<Vec<Vec<u8>>, String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_reader(track_xml);
    reader.trim_text(false);
    let mut buf = Vec::new();
    let mut in_ms = false;
    let mut in_slot_list = false;
    let mut slots: Vec<Vec<u8>> = Vec::new();

    loop {
        let start_pos = reader.buffer_position();
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => match e.name().as_ref() {
                b"MainSequencer" => in_ms = true,
                b"ClipSlotList" if in_ms => in_slot_list = true,
                b"ClipSlot" if in_ms && in_slot_list => {
                    let tag = e.name().as_ref().to_vec();
                    let mut depth_inner = 1i32;
                    let mut ib = Vec::new();
                    loop {
                        match reader.read_event_into(&mut ib) {
                            Ok(Event::Start(_)) => depth_inner += 1,
                            Ok(Event::End(ref end_e)) => {
                                depth_inner -= 1;
                                if depth_inner == 0 && end_e.name().as_ref() == tag.as_slice() {
                                    break;
                                }
                            }
                            Ok(Event::Eof) => break,
                            Err(_) => break,
                            _ => {}
                        }
                        ib.clear();
                    }
                    let end_pos = reader.buffer_position();
                    slots.push(track_xml[start_pos..end_pos].to_vec());
                }
                _ => {}
            },
            Ok(Event::End(ref e)) => match e.name().as_ref() {
                b"ClipSlotList" if in_ms => in_slot_list = false,
                b"MainSequencer" => in_ms = false,
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML error scanning ClipSlots: {}", e)),
            _ => {}
        }
        buf.clear();
    }
    Ok(slots)
}

fn insert_before_clipslotlist_close(remote_track: &[u8], insert: &[Vec<u8>]) -> Result<Vec<u8>, String> {
    let s = std::str::from_utf8(remote_track).map_err(|_| "Track XML is not valid UTF-8".to_string())?;
    let close = "</ClipSlotList>";
    let idx = s
        .find(close)
        .ok_or_else(|| "No </ClipSlotList> in remote track (cannot splice clips)".to_string())?;
    let mut out = Vec::with_capacity(remote_track.len() + insert.iter().map(|v| v.len()).sum::<usize>());
    out.extend_from_slice(&remote_track[..idx]);
    for chunk in insert {
        out.push(b'\n');
        out.extend_from_slice(chunk);
    }
    out.extend_from_slice(&remote_track[idx..]);
    Ok(out)
}

fn slots_for_id_fingerprints(
    local_track: &[u8],
    want: &HashSet<String>,
) -> Result<Vec<Vec<u8>>, String> {
    if want.is_empty() {
        return Ok(Vec::new());
    }
    let slots = extract_clip_slots_xml(local_track)?;
    let mut need: HashSet<String> = want.iter().filter(|fp| fp.starts_with("id:")).cloned().collect();
    let mut out = Vec::new();
    for slot in &slots {
        if let Some(cid) = try_clip_id_from_slot(slot) {
            let fp = format!("id:{}", cid);
            if need.remove(&fp) {
                out.push(slot.clone());
            }
        }
    }
    if !need.is_empty() {
        return Err(format!(
            "Could not find ClipSlot XML for local clip ids: {:?}",
            need
        ));
    }
    Ok(out)
}

fn patch_effective_name_suffix(raw: &mut Vec<u8>, suffix: &str) {
    let Ok(s) = std::str::from_utf8(raw) else {
        return;
    };
    if let Some(idx) = s.find("EffectiveName") {
        if let Some(v) = s[idx..].find("Value=\"") {
            let abs = idx + v + "Value=\"".len();
            if let Some(end) = s[abs..].find('"') {
                let old_val = &s[abs..abs + end];
                let new_val = format!("{}{}", old_val, suffix);
                let mut s2 = s[..abs].to_string();
                s2.push_str(&new_val);
                s2.push_str(&s[abs + end..]);
                *raw = s2.into_bytes();
            }
        }
    }
}

fn apply_resolution_choice(
    choice: &str,
    local_raw: &RawTrack,
    remote_raw: &RawTrack,
    merged_so_far: &[RawTrack],
) -> Result<Vec<RawTrack>, String> {
    match choice {
        "remote" => Ok(vec![remote_raw.clone()]),
        "local" => Ok(vec![local_raw.clone()]),
        "duplicate" => {
            let mut r = remote_raw.clone();
            patch_effective_name_suffix(&mut r.raw_bytes, " (Remote)");
            let mut l = local_raw.clone();
            let r_utf8 = std::str::from_utf8(&r.raw_bytes)
                .map_err(|_| "remote track is not valid UTF-8".to_string())?;
            let mut cap = max_lom_id_scan(r_utf8);
            for t in merged_so_far {
                let frag = std::str::from_utf8(&t.raw_bytes)
                    .map_err(|_| "merged track is not valid UTF-8".to_string())?;
                cap = cap.max(max_lom_id_scan(frag));
            }
            remap_all_lom_ids_in_duplicated_track(&mut l, cap)?;
            patch_effective_name_suffix(&mut l.raw_bytes, " (Local)");
            Ok(vec![r, l])
        }
        _ => Err("Invalid resolution choice".into()),
    }
}

fn merge_shared_track(
    base_t: Option<&Track>,
    local_t: &Track,
    remote_t: &Track,
    local_raw: &RawTrack,
    remote_raw: &RawTrack,
    conflicting_ids: &HashSet<String>,
    resolutions: Option<&HashMap<String, String>>,
    track_id: &str,
    merged_so_far: &[RawTrack],
) -> Result<Vec<RawTrack>, String> {
    if conflicting_ids.contains(track_id) {
        let map = resolutions.ok_or_else(|| "Missing resolutions for ALS merge conflict".to_string())?;
        let raw = map
            .get(track_id)
            .ok_or_else(|| format!("Missing resolution for track {}", track_id))?;
        let ch = normalize_choice(raw)
            .ok_or_else(|| format!("Invalid resolution {:?} for track {}", raw, track_id))?;
        return apply_resolution_choice(ch, local_raw, remote_raw, merged_so_far);
    }

    let base_fp: HashSet<String> = base_t
        .map(|b| b.clips.iter().map(clip_fingerprint).collect())
        .unwrap_or_default();
    let local_added: HashSet<String> = local_t
        .clips
        .iter()
        .filter(|c| !base_fp.contains(&clip_fingerprint(*c)))
        .map(clip_fingerprint)
        .collect();
    let remote_added: HashSet<String> = remote_t
        .clips
        .iter()
        .filter(|c| !base_fp.contains(&clip_fingerprint(*c)))
        .map(clip_fingerprint)
        .collect();
    if local_added.is_empty() {
        return Ok(vec![remote_raw.clone()]);
    }
    if remote_added.is_empty() {
        return Ok(vec![local_raw.clone()]);
    }

    let non_id: Vec<String> = local_added
        .iter()
        .filter(|fp| !fp.starts_with("id:"))
        .cloned()
        .collect();
    if !non_id.is_empty() {
        let all_local_non_id = local_added.iter().all(|fp| !fp.starts_with("id:"));
        let local_clip_refs: Vec<&ClipSummary> = local_t
            .clips
            .iter()
            .filter(|c| local_added.contains(&clip_fingerprint(*c)))
            .collect();
        let remote_clip_refs: Vec<&ClipSummary> = remote_t
            .clips
            .iter()
            .filter(|c| remote_added.contains(&clip_fingerprint(*c)))
            .collect();
        if all_local_non_id
            && disjoint_unstable_midi_parallel_ok(&local_clip_refs, &remote_clip_refs)
        {
            if let Some(merged) =
                merge_disjoint_midi_slots(local_raw, remote_raw, &local_clip_refs)?
            {
                return Ok(vec![merged]);
            }
        }
        return Err(
            "Parallel clip additions without stable clip Id cannot be merged automatically — resolve using the conflict UI (Remote / Local / Duplicate)."
                .into(),
        );
    }

    let slots = slots_for_id_fingerprints(&local_raw.raw_bytes, &local_added)?;
    let merged_bytes = insert_before_clipslotlist_close(&remote_raw.raw_bytes, &slots)?;
    Ok(vec![RawTrack {
        id: remote_raw.id.clone(),
        raw_bytes: merged_bytes,
    }])
}

/// `Ok(Ok(bytes))` = merged gzip ALS. `Ok(Err(json))` = conflict report JSON for the UI.
pub fn merge_als_three_way_bytes(
    base_bytes: &[u8],
    local_bytes: &[u8],
    remote_bytes: &[u8],
    resolutions_json: Option<&str>,
) -> Result<Result<Vec<u8>, String>, String> {
    let local_xml = decompress_if_needed(local_bytes)?;
    let remote_xml = decompress_if_needed(remote_bytes)?;

    let base_p = parser::parse_als_buffer(base_bytes)?;
    let local_p = parser::parse_als_buffer(local_bytes)?;
    let remote_p = parser::parse_als_buffer(remote_bytes)?;

    let conflicts = detect_conflicts(&base_p, &local_p, &remote_p);
    let resolutions: Option<HashMap<String, String>> = match resolutions_json {
        Some(s) if !s.trim().is_empty() => {
            let r: ResolutionInput = serde_json::from_str(s).map_err(|e| e.to_string())?;
            Some(r.choices)
        }
        _ => None,
    };

    if !conflicts.is_empty() && resolutions.is_none() {
        let rep = AlsMergeConflictReport {
            ok: false,
            conflicts,
        };
        return Ok(Err(serde_json::to_string(&rep).map_err(|e| e.to_string())?));
    }

    if !conflicts.is_empty() {
        let res = resolutions.as_ref().unwrap();
        for c in &conflicts {
            if !res.contains_key(&c.track_id) {
                return Err(format!("Missing resolution for track {}", c.track_id));
            }
            if normalize_choice(&res[&c.track_id]).is_none() {
                return Err(format!("Invalid resolution for track {}", c.track_id));
            }
        }
    }

    let conflicting_ids: HashSet<String> = conflicts.iter().map(|c| c.track_id.clone()).collect();

    let remote_sections = split_als_sections(&remote_xml)?;
    let local_sections = split_als_sections(&local_xml)?;

    let local_raw = raw_tracks_by_id(&local_sections.tracks);

    let bt = tracks_by_id(&base_p);
    let lt = tracks_by_id(&local_p);
    let rt = tracks_by_id(&remote_p);

    let remote_ids: HashSet<String> = remote_sections        .tracks
        .iter()
        .map(|t| t.id.clone())
        .collect();

    let mut merged: Vec<RawTrack> = Vec::new();

    for rt_raw in &remote_sections.tracks {
        if rt_raw.id.is_empty() {
            merged.push(rt_raw.clone());
            continue;
        }
        let id = rt_raw.id.as_str();
        if let (Some(lraw), Some(lt_t), Some(rt_t)) = (local_raw.get(id), lt.get(id), rt.get(id)) {
            let base_t = bt.get(id).copied();
            let parts = merge_shared_track(
                base_t,
                lt_t,
                rt_t,
                lraw,
                rt_raw,
                &conflicting_ids,
                resolutions.as_ref(),
                id,
                &merged,
            )?;
            merged.extend(parts);
        } else {
            merged.push(rt_raw.clone());
        }
    }

    for lt_raw in &local_sections.tracks {
        if lt_raw.id.is_empty() {
            continue;
        }
        if !remote_ids.contains(&lt_raw.id) {
            merged.push(lt_raw.clone());
        }
    }

    resolve_track_id_conflicts(&mut merged);

    let mut merged_xml =
        reassemble_to_vec(&remote_sections.prefix, &merged, &remote_sections.suffix);
    let local_s = std::str::from_utf8(&local_xml)
        .map_err(|_| "Local ALS is not valid UTF-8 (NextPointeeId fix)".to_string())?;
    let remote_s = std::str::from_utf8(&remote_xml)
        .map_err(|_| "Remote ALS is not valid UTF-8 (NextPointeeId fix)".to_string())?;
    patch_next_pointee_id_for_merge(local_s, remote_s, &mut merged_xml)?;

    let gz = compress_gzip(&merged_xml)?;
    Ok(Ok(gz))
}
