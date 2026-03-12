//! Recursive-descent XML parser for Ableton Live Set (.als) files.
//!
//! Instead of a flat event loop, each structural element (Track, DeviceChain,
//! Device, Branch, etc.) has its own parsing function that consumes XML events
//! until its closing tag, enabling arbitrary nesting depth (e.g., racks within
//! racks within racks).

use std::io::BufRead;

use quick_xml::events::Event;
use quick_xml::reader::Reader;

use crate::models::*;
use crate::utils::*;

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/// Parse an Ableton Live Set from a file path. Handles gzip detection automatically.
pub fn parse_als_file(path: &str) -> Result<Project, String> {
    let reader = streaming_reader_from_path(path)?;
    parse_als_reader(reader)
}

/// Parse an Ableton Live Set from an in-memory buffer (e.g., a git blob).
pub fn parse_als_buffer(data: &[u8]) -> Result<Project, String> {
    let reader = streaming_reader_from_buffer(data)?;
    parse_als_reader(reader)
}

// ─────────────────────────────────────────────
// Core parser
// ─────────────────────────────────────────────

/// Parse from any buffered reader into a Project.
fn parse_als_reader(reader: Box<dyn BufRead + '_>) -> Result<Project, String> {
    let mut xml = Reader::from_reader(reader);
    let mut buf = Vec::new();
    let mut project = Project::new();

    loop {
        match xml.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let tag = e.name();
                match tag.as_ref() {
                    b"Ableton" => {
                        // Extract version and creator from root element
                        project.version = get_attr_value(e, b"MajorVersion")
                            .map(|major| {
                                let minor = get_attr_value(e, b"MinorVersion")
                                    .unwrap_or_default();
                                let revision = get_attr_value(e, b"Revision")
                                    .unwrap_or_default();
                                format!("{}.{}.{}", major, minor, revision)
                            });
                        project.creator = get_attr_value(e, b"Creator");
                    }
                    b"Tempo" => {
                        // Next Manual element should have the tempo value
                        project.tempo = read_manual_value_f64(&mut xml, &mut buf, b"Tempo");
                    }
                    b"TimeSignature" => {
                        // Parse time signature — look for Numerator and Denominator
                        parse_time_signature(&mut xml, &mut buf, &mut project);
                    }
                    b"Tracks" => {
                        parse_tracks(&mut xml, &mut buf, &mut project);
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    Ok(project)
}

// ─────────────────────────────────────────────
// Track parsing
// ─────────────────────────────────────────────

/// Parse the <Tracks> container. Dispatches to parse_track for each track element.
fn parse_tracks(xml: &mut Reader<Box<dyn BufRead + '_>>, buf: &mut Vec<u8>, project: &mut Project) {
    let mut track_index: usize = 0;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref e)) => {
                let tag_bytes = e.name().as_ref().to_vec();
                match tag_bytes.as_slice() {
                    b"AudioTrack" | b"MidiTrack" | b"ReturnTrack" | b"GroupTrack" => {
                        let track_type = String::from_utf8_lossy(&tag_bytes).into_owned();
                        let id = get_id(e).unwrap_or_default();
                        let close_tag = tag_bytes.clone();
                        let mut track = Track::new(&track_type, &id, track_index);
                        parse_track(xml, buf, &mut track, &close_tag);
                        project.tracks.push(track);
                        track_index += 1;
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) if e.name().as_ref() == b"Tracks" => break,
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
}

/// Parse a single track element until its closing tag.
/// Extracts: Name, Color, DeviceChain (with devices), Mixer (routing/sends), clips.
fn parse_track(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    track: &mut Track,
    close_tag: &[u8],
) {
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let tag = e.name();
                match tag.as_ref() {
                    b"Name" if depth == 2 => {
                        // Track-level <Name> block
                        let (eff, usr) = parse_name_block(xml, buf, b"Name");
                        if !eff.is_empty() {
                            track.effective_name = eff;
                        }
                        if let Some(u) = usr {
                            track.user_name = Some(u);
                        }
                        depth -= 1; // parse_name_block consumed the </Name>
                    }
                    b"Color" if depth == 2 => {
                        // handled as empty element below, but some versions use <Color><Value .../></Color>
                    }
                    b"DeviceChain" if depth == 2 => {
                        parse_track_device_chain(xml, buf, track);
                        depth -= 1; // consumed </DeviceChain>
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(ref e)) => {
                let tag = e.name();
                match tag.as_ref() {
                    b"Color" if depth == 1 => {
                        if let Some(val) = get_attr_value(e, b"Value") {
                            track.color = val.parse::<i32>().unwrap_or(-1);
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == close_tag && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
}

// ─────────────────────────────────────────────
// DeviceChain parsing (track-level)
// ─────────────────────────────────────────────

/// Parse the <DeviceChain> element at track level.
/// This is the outer DeviceChain directly under a Track, which contains:
///   - <DeviceChain> (inner, contains <Devices>)
///   - <Mixer> (contains sends, output routing)
///   - <MainSequencer> (contains clip slots)  
fn parse_track_device_chain(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    track: &mut Track,
) {
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let tag = e.name();
                match tag.as_ref() {
                    // Inner DeviceChain contains the actual Devices list
                    b"DeviceChain" if depth == 2 => {
                        parse_inner_device_chain(xml, buf, &mut track.device_chain);
                        depth -= 1;
                    }
                    b"Mixer" if depth == 2 => {
                        parse_mixer(xml, buf, &mut track.routing);
                        depth -= 1;
                    }
                    b"MainSequencer" if depth == 2 => {
                        parse_main_sequencer(xml, buf, &mut track.clips);
                        depth -= 1;
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == b"DeviceChain" && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
}

/// Parse the inner <DeviceChain> (the one that contains <Devices>).
fn parse_inner_device_chain(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    chain: &mut DeviceChain,
) {
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                if e.name().as_ref() == b"Devices" && depth == 2 {
                    parse_devices_list(xml, buf, &mut chain.devices);
                    depth -= 1;
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == b"DeviceChain" && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
}

// ─────────────────────────────────────────────
// Device parsing
// ─────────────────────────────────────────────

/// List of XML tag names that are Ableton device elements.
/// Any unknown Start tag inside <Devices> is also treated as a device.
const RACK_DEVICES: &[&[u8]] = &[
    b"DrumGroupDevice",
    b"InstrumentGroupDevice",
    b"AudioEffectGroupDevice",
    b"MidiEffectGroupDevice",
];

/// Parse the <Devices> list, creating a Device for each child element.
fn parse_devices_list(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    devices: &mut Vec<Device>,
) {
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                if depth == 2 {
                    // Every direct child of <Devices> is a device
                    let tag_bytes = e.name().as_ref().to_vec();
                    let class_name = String::from_utf8_lossy(&tag_bytes).into_owned();
                    let id = get_id(e).unwrap_or_default();
                    let mut device = Device::new(&class_name, &id);
                    let is_rack = RACK_DEVICES.iter().any(|r| *r == tag_bytes.as_slice());
                    parse_device(xml, buf, &mut device, &tag_bytes, is_rack);
                    devices.push(device);
                    depth -= 1; // parse_device consumed the closing tag
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == b"Devices" && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
}

/// Parse a single device element. Extracts:
/// - Name (EffectiveName, UserName)
/// - On/Off status
/// - PluginDesc (VST/AU metadata)
/// - Macros (for racks)
/// - Branches (for racks — recursive)
fn parse_device(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    device: &mut Device,
    close_tag: &[u8],
    is_rack: bool,
) {
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let tag = e.name();
                match tag.as_ref() {
                    b"Name" if depth == 2 => {
                        let (eff, _usr) = parse_name_block(xml, buf, b"Name");
                        if !eff.is_empty() {
                            device.name = eff;
                        }
                        depth -= 1;
                    }
                    b"On" if depth == 2 => {
                        device.is_active = read_manual_value_bool(xml, buf, b"On");
                        depth -= 1;
                    }
                    b"PluginDesc" if depth == 2 => {
                        device.plugin_info = parse_plugin_desc(xml, buf);
                        depth -= 1;
                    }
                    b"Branches" if is_rack && depth == 2 => {
                        let branches = parse_branches(xml, buf);
                        if !branches.is_empty() {
                            device.sub_chains = Some(branches);
                        }
                        depth -= 1;
                    }
                    // Macro controls: Macro0 through Macro15
                    other if depth == 2 && is_macro_tag(other) => {
                        let macro_tag = other.to_vec();
                        if let Some(macro_param) = parse_macro(xml, buf, &macro_tag) {
                            device.macros.push(macro_param);
                        }
                        depth -= 1;
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(ref e)) => {
                // Some attributes appear as self-closing at depth 1
                if depth == 1 {
                    let tag = e.name();
                    match tag.as_ref() {
                        b"On" => {
                            if let Some(val) = get_attr_value(e, b"Value") {
                                device.is_active = val == "true";
                            }
                        }
                        _ => {}
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == close_tag && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
}

/// Check if a tag name matches MacroN (Macro0 through Macro15)
fn is_macro_tag(tag: &[u8]) -> bool {
    if tag.len() < 6 || tag.len() > 7 {
        return false;
    }
    if !tag.starts_with(b"Macro") {
        return false;
    }
    let suffix = &tag[5..];
    match suffix {
        b"0" | b"1" | b"2" | b"3" | b"4" | b"5" | b"6" | b"7" | b"8" | b"9" | b"10"
        | b"11" | b"12" | b"13" | b"14" | b"15" => true,
        _ => false,
    }
}

/// Parse a MacroN element — extract the Manual value.
fn parse_macro(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    tag_bytes: &[u8],
) -> Option<MacroParameter> {
    // Extract index from tag name
    let tag_str = std::str::from_utf8(tag_bytes).ok()?;
    let index: u8 = tag_str.strip_prefix("Macro")?.parse().ok()?;

    let value = read_manual_value_f64(xml, buf, tag_bytes).unwrap_or(0.0);

    Some(MacroParameter {
        index,
        name: format!("Macro {}", index + 1),
        value,
    })
}

// ─────────────────────────────────────────────
// Branch parsing (recursive)
// ─────────────────────────────────────────────

/// Branch tag names we recognize
const BRANCH_TAGS: &[&[u8]] = &[
    b"DrumBranch",
    b"InstrumentBranch",
    b"AudioEffectBranch",
    b"MidiEffectBranch",
];

/// Parse the <Branches> element inside a rack device.
/// Each branch contains its own <DeviceChain>, enabling recursive nesting.
fn parse_branches(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
) -> Vec<Branch> {
    let mut branches = Vec::new();
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let tag_bytes = e.name().as_ref().to_vec();
                if depth == 2 && BRANCH_TAGS.iter().any(|b| *b == tag_bytes.as_slice()) {
                    let branch_type = String::from_utf8_lossy(&tag_bytes).into_owned();
                    let mut branch = Branch::new(&branch_type);
                    parse_branch(xml, buf, &mut branch, &tag_bytes);
                    branches.push(branch);
                    depth -= 1;
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == b"Branches" && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }

    branches
}

/// Parse a single branch element. Extracts Name and its own DeviceChain.
fn parse_branch(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    branch: &mut Branch,
    close_tag: &[u8],
) {
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let tag = e.name();
                match tag.as_ref() {
                    b"Name" if depth == 2 => {
                        let (eff, usr) = parse_name_block(xml, buf, b"Name");
                        if !eff.is_empty() {
                            branch.effective_name = eff;
                        }
                        if let Some(u) = usr {
                            branch.user_name = Some(u);
                        }
                        depth -= 1;
                    }
                    b"DeviceChain" if depth == 2 => {
                        // This is the branch's own device chain — recurse!
                        parse_branch_device_chain(xml, buf, &mut branch.device_chain);
                        depth -= 1;
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == close_tag && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
}

/// Parse the <DeviceChain> inside a branch. This has its <Devices> list directly.
/// Different from the track-level DeviceChain which has an extra nesting layer.
fn parse_branch_device_chain(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    chain: &mut DeviceChain,
) {
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                if e.name().as_ref() == b"Devices" && depth == 2 {
                    parse_devices_list(xml, buf, &mut chain.devices);
                    depth -= 1;
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == b"DeviceChain" && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
}

// ─────────────────────────────────────────────
// Mixer / Routing parsing
// ─────────────────────────────────────────────

/// Parse the <Mixer> element, extracting output routing and send levels.
fn parse_mixer(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    routing: &mut TrackRouting,
) {
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let tag = e.name();
                match tag.as_ref() {
                    b"AudioOutputRouting" if depth == 2 => {
                        routing.output_target =
                            parse_routing_target(xml, buf, b"AudioOutputRouting");
                        depth -= 1;
                    }
                    b"Sends" if depth == 2 => {
                        parse_sends(xml, buf, &mut routing.sends);
                        depth -= 1;
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == b"Mixer" && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
}

/// Parse a routing element (AudioOutputRouting, MidiOutputRouting, etc.)
/// to extract the Target > Value attribute.
fn parse_routing_target(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    close_tag: &[u8],
) -> String {
    let mut depth = 1u32;
    let mut target = String::new();

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref _e)) => {
                depth += 1;
            }
            Ok(Event::Empty(ref e)) => {
                if e.name().as_ref() == b"Target" {
                    if let Some(val) = get_attr_value(e, b"Value") {
                        target = val;
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == close_tag && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }

    target
}

/// Parse the <Sends> list of TrackSendHolder elements.
fn parse_sends(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    sends: &mut Vec<SendInfo>,
) {
    let mut depth = 1u32;
    let mut send_index: usize = 0;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                if e.name().as_ref() == b"TrackSendHolder" && depth == 2 {
                    let send = parse_send_holder(xml, buf, send_index);
                    sends.push(send);
                    send_index += 1;
                    depth -= 1;
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == b"Sends" && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
}

/// Parse a single <TrackSendHolder> to extract the send value and active state.
fn parse_send_holder(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    index: usize,
) -> SendInfo {
    let mut info = SendInfo {
        send_index: index,
        value: 0.0,
        is_active: true,
    };
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                match e.name().as_ref() {
                    b"Send" if depth == 2 => {
                        info.value = read_manual_value_f64(xml, buf, b"Send").unwrap_or(0.0);
                        depth -= 1;
                    }
                    b"Active" if depth == 2 => {
                        info.is_active = read_manual_value_bool(xml, buf, b"Active");
                        depth -= 1;
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == b"TrackSendHolder" && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }

    info
}

// ─────────────────────────────────────────────
// Clip / Sample parsing
// ─────────────────────────────────────────────

/// Parse the <MainSequencer> to extract clips.
fn parse_main_sequencer(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    clips: &mut Vec<ClipSummary>,
) {
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let tag_bytes = e.name().as_ref().to_vec();
                match tag_bytes.as_slice() {
                    b"AudioClip" | b"MidiClip" if depth >= 2 => {
                        let mut clip = ClipSummary {
                            name: String::new(),
                            start_time: 0.0,
                            end_time: 0.0,
                            color: -1,
                            sample_ref: None,
                        };
                        parse_clip(xml, buf, &mut clip, &tag_bytes);
                        clips.push(clip);
                        depth -= 1;
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == b"MainSequencer" && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
}

/// Parse an AudioClip or MidiClip element.
fn parse_clip(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    clip: &mut ClipSummary,
    close_tag: &[u8],
) {
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let tag = e.name();
                match tag.as_ref() {
                    b"Name" if depth == 2 => {
                        let (eff, _usr) = parse_name_block(xml, buf, b"Name");
                        if !eff.is_empty() {
                            clip.name = eff;
                        }
                        depth -= 1;
                    }
                    b"SampleRef" if depth == 2 => {
                        clip.sample_ref = parse_sample_ref(xml, buf);
                        depth -= 1;
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(ref e)) => {
                let tag = e.name();
                match tag.as_ref() {
                    b"CurrentStart" => {
                        if let Some(val) = get_attr_value(e, b"Value") {
                            clip.start_time = val.parse().unwrap_or(0.0);
                        }
                    }
                    b"CurrentEnd" => {
                        if let Some(val) = get_attr_value(e, b"Value") {
                            clip.end_time = val.parse().unwrap_or(0.0);
                        }
                    }
                    b"Color" => {
                        if let Some(val) = get_attr_value(e, b"Value") {
                            clip.color = val.parse().unwrap_or(-1);
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == close_tag && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
}

/// Parse a <SampleRef> element, extracting the FileRef and OriginalCrc.
fn parse_sample_ref(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
) -> Option<SampleReference> {
    let mut name = String::new();
    let mut relative_path = String::new();
    let mut original_crc = String::new();
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref _e)) => {
                depth += 1;
            }
            Ok(Event::Empty(ref e)) => {
                let tag = e.name();
                match tag.as_ref() {
                    b"Name" => {
                        if let Some(val) = get_attr_value(e, b"Value") {
                            name = val;
                        }
                    }
                    b"RelativePath" => {
                        if let Some(val) = get_attr_value(e, b"Value") {
                            relative_path = val;
                        }
                    }
                    b"OriginalCrc" => {
                        if let Some(val) = get_attr_value(e, b"Value") {
                            original_crc = val;
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == b"SampleRef" && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }

    if name.is_empty() && relative_path.is_empty() && original_crc.is_empty() {
        None
    } else {
        Some(SampleReference {
            name,
            relative_path,
            original_crc,
        })
    }
}

// ─────────────────────────────────────────────
// Plugin metadata parsing
// ─────────────────────────────────────────────

/// Parse a <PluginDesc> element to extract VST/AU metadata.
fn parse_plugin_desc(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
) -> Option<PluginMetadata> {
    let mut plugin_name = String::new();
    let mut plugin_id = None;
    let mut manufacturer = None;
    let mut format = None;
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref _e)) => {
                depth += 1;
                let tag = _e.name();
                match tag.as_ref() {
                    b"VstPluginInfo" => {
                        format = Some("VST2".to_string());
                    }
                    b"Vst3PluginInfo" => {
                        format = Some("VST3".to_string());
                    }
                    b"AuPluginInfo" => {
                        format = Some("AU".to_string());
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(ref e)) => {
                let tag = e.name();
                match tag.as_ref() {
                    b"PlugName" => {
                        if let Some(val) = get_attr_value(e, b"Value") {
                            plugin_name = val;
                        }
                    }
                    b"UniqueId" => {
                        if let Some(val) = get_attr_value(e, b"Value") {
                            plugin_id = Some(val);
                        }
                    }
                    b"Manufacturer" => {
                        if let Some(val) = get_attr_value(e, b"Value") {
                            manufacturer = Some(val);
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == b"PluginDesc" && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }

    if plugin_name.is_empty() {
        None
    } else {
        Some(PluginMetadata {
            plugin_name,
            plugin_id,
            manufacturer,
            format,
        })
    }
}

// ─────────────────────────────────────────────
// Shared helpers for common XML patterns
// ─────────────────────────────────────────────

/// Parse a <Name> block which contains <EffectiveName Value="..."/> and <UserName Value="..."/>.
/// Consumes events until the closing </Name> tag.
/// Returns (effective_name, optional_user_name).
fn parse_name_block(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    close_tag: &[u8],
) -> (String, Option<String>) {
    let mut effective_name = String::new();
    let mut user_name: Option<String> = None;
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref _e)) => {
                depth += 1;
            }
            Ok(Event::Empty(ref e)) => {
                let tag = e.name();
                match tag.as_ref() {
                    b"EffectiveName" => {
                        if let Some(val) = get_attr_value(e, b"Value") {
                            effective_name = val;
                        }
                    }
                    b"UserName" => {
                        if let Some(val) = get_attr_value(e, b"Value") {
                            if !val.is_empty() {
                                user_name = Some(val);
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == close_tag && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }

    (effective_name, user_name)
}

/// Read a <Manual Value="..."/> inside the current element, returning the value as f64.
/// Consumes events until the closing tag.
fn read_manual_value_f64(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    close_tag: &[u8],
) -> Option<f64> {
    let mut value: Option<f64> = None;
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref _e)) => {
                depth += 1;
            }
            Ok(Event::Empty(ref e)) => {
                if e.name().as_ref() == b"Manual" {
                    if let Some(val) = get_attr_value(e, b"Value") {
                        value = val.parse().ok();
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == close_tag && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }

    value
}

/// Read a <Manual Value="true|false"/> inside the current element.
/// Consumes events until the closing tag.
fn read_manual_value_bool(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    close_tag: &[u8],
) -> bool {
    let mut value = true;
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref _e)) => {
                depth += 1;
            }
            Ok(Event::Empty(ref e)) => {
                if e.name().as_ref() == b"Manual" {
                    if let Some(val) = get_attr_value(e, b"Value") {
                        value = val == "true";
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == close_tag && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }

    value
}

/// Parse time signature numerator/denominator from within <TimeSignature>.
fn parse_time_signature(
    xml: &mut Reader<Box<dyn BufRead + '_>>,
    buf: &mut Vec<u8>,
    project: &mut Project,
) {
    let mut depth = 1u32;

    loop {
        buf.clear();
        match xml.read_event_into(buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                match e.name().as_ref() {
                    b"Numerator" if depth == 2 => {
                        if let Some(val) = read_manual_value_f64(xml, buf, b"Numerator") {
                            project.time_sig_numerator = Some(val as i32);
                        }
                        depth -= 1;
                    }
                    b"Denominator" if depth == 2 => {
                        if let Some(val) = read_manual_value_f64(xml, buf, b"Denominator") {
                            project.time_sig_denominator = Some(val as i32);
                        }
                        depth -= 1;
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                depth -= 1;
                if e.name().as_ref() == b"TimeSignature" && depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
}
