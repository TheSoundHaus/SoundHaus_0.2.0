use serde::{Serialize, Deserialize};

// ─────────────────────────────────────────────
// Core Project Model
// ─────────────────────────────────────────────

/// Snapshot schema version. Increment only on breaking structural changes.
/// New optional fields should use `#[serde(default)]` and remain backwards-compatible
/// without incrementing this value.
fn default_schema_version() -> u32 { 1 }

/// Top-level representation of an Ableton Live Set (.als) file.
/// This struct is the Minimal Project Description (MPD) written to
/// `.soundhaus/{als_session_name}/snapshot.json` on every commit.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Project {
    /// Schema version for forwards/backwards compatibility.
    /// Deserializes as 0 when reading snapshots that pre-date this field.
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    /// Ableton Live version string (e.g. "11.3.2")
    pub version: Option<String>,
    /// Creator tag from the XML root
    pub creator: Option<String>,
    /// Tempo in BPM
    pub tempo: Option<f64>,
    /// Time signature numerator (e.g. 4)
    pub time_sig_numerator: Option<i32>,
    /// Time signature denominator (e.g. 4)
    pub time_sig_denominator: Option<i32>,
    /// All tracks in the live set, in order
    pub tracks: Vec<Track>,
}

impl Project {
    pub fn new() -> Self {
        Self {
            schema_version: 1,
            version: None,
            creator: None,
            tempo: None,
            time_sig_numerator: None,
            time_sig_denominator: None,
            tracks: Vec::new(),
        }
    }
}

// ─────────────────────────────────────────────
// Track
// ─────────────────────────────────────────────

/// A single track in the Live Set.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Track {
    /// XML @Id attribute — stable identity across versions
    pub id: String,
    /// "AudioTrack", "MidiTrack", "ReturnTrack", "GroupTrack"
    pub track_type: String,
    /// The displayed name in Ableton (resolved from Name > EffectiveName)
    pub effective_name: String,
    /// User-assigned name (Name > UserName), if set
    pub user_name: Option<String>,
    /// Track color index
    pub color: i32,
    /// Positional index in the track list (for move detection)
    pub track_index: usize,
    /// The device chain on this track
    pub device_chain: DeviceChain,
    /// Routing information (sends, output target)
    pub routing: TrackRouting,
    /// Clips on this track (from MainSequencer > ClipSlotList or ArrangerAutomation)
    pub clips: Vec<ClipSummary>,
}

impl Track {
    pub fn new(track_type: &str, id: &str, index: usize) -> Self {
        Self {
            id: id.to_string(),
            track_type: track_type.to_string(),
            effective_name: String::new(),
            user_name: None,
            color: -1,
            track_index: index,
            device_chain: DeviceChain::new(),
            routing: TrackRouting::new(),
            clips: Vec::new(),
        }
    }
}

// ─────────────────────────────────────────────
// Device Chain & Devices
// ─────────────────────────────────────────────

/// A chain of audio/MIDI devices. Found on tracks and inside rack branches.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct DeviceChain {
    pub devices: Vec<Device>,
}

impl DeviceChain {
    pub fn new() -> Self {
        Self { devices: Vec::new() }
    }
}

/// A single device (instrument, effect, or rack).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Device {
    /// XML @Id attribute
    pub id: String,
    /// Device class name from the XML tag (e.g. "Compressor2", "DrumGroupDevice")
    pub class_name: String,
    /// User-visible name (EffectiveName or UserName)
    pub name: String,
    /// Whether the device is turned on (<On><Manual Value="true"/>)
    pub is_active: bool,
    /// VST/AU plugin metadata, if this is a plugin device
    pub plugin_info: Option<PluginMetadata>,
    /// Macro parameter values (for rack devices)
    pub macros: Vec<MacroParameter>,
    /// Sub-chains for rack devices (DrumGroupDevice, InstrumentGroupDevice, etc.)
    /// Each branch contains its own DeviceChain, enabling recursive nesting.
    pub sub_chains: Option<Vec<Branch>>,
}

impl Device {
    pub fn new(class_name: &str, id: &str) -> Self {
        Self {
            id: id.to_string(),
            class_name: class_name.to_string(),
            name: String::new(),
            is_active: true,
            plugin_info: None,
            macros: Vec::new(),
            sub_chains: None,
        }
    }

    /// Returns true if this device is a rack type that can contain branches
    #[allow(dead_code)]
    pub fn is_rack(&self) -> bool {
        matches!(
            self.class_name.as_str(),
            "DrumGroupDevice"
                | "InstrumentGroupDevice"
                | "AudioEffectGroupDevice"
                | "MidiEffectGroupDevice"
        )
    }
}

/// A branch inside a rack device. Each branch has its own device chain.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Branch {
    /// The XML tag name (e.g. "DrumBranch", "InstrumentBranch")
    pub branch_type: String,
    /// Resolved display name
    pub effective_name: String,
    /// User-assigned name
    pub user_name: Option<String>,
    /// The device chain within this branch (recursive)
    pub device_chain: DeviceChain,
}

impl Branch {
    pub fn new(branch_type: &str) -> Self {
        Self {
            branch_type: branch_type.to_string(),
            effective_name: String::new(),
            user_name: None,
            device_chain: DeviceChain::new(),
        }
    }
}

// ─────────────────────────────────────────────
// Plugin Metadata
// ─────────────────────────────────────────────

/// Metadata about a VST/AU plugin instance.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct PluginMetadata {
    /// Display name of the plugin (e.g. "Serum", "FabFilter Pro-Q 3")
    pub plugin_name: String,
    /// Unique numeric identifier (VST UniqueId or AU ComponentSubType)
    pub plugin_id: Option<String>,
    /// Plugin manufacturer
    pub manufacturer: Option<String>,
    /// Plugin format: "VST2", "VST3", "AU"
    pub format: Option<String>,
}

// ─────────────────────────────────────────────
// Macro Parameters
// ─────────────────────────────────────────────

/// A macro knob on a rack device (0-15).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct MacroParameter {
    /// Macro index (0-15)
    pub index: u8,
    /// Display name (from MacroDisplayNames or default "Macro N")
    pub name: String,
    /// Current value
    pub value: f64,
}

// ─────────────────────────────────────────────
// Routing
// ─────────────────────────────────────────────

/// Routing configuration for a track.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct TrackRouting {
    /// Output routing target (e.g. "Master", "Bus 1")
    pub output_target: String,
    /// Send levels to return tracks
    pub sends: Vec<SendInfo>,
}

impl TrackRouting {
    pub fn new() -> Self {
        Self {
            output_target: String::new(),
            sends: Vec::new(),
        }
    }
}

/// A single send on a track.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct SendInfo {
    /// Zero-based send index (Send A = 0, Send B = 1, etc.)
    pub send_index: usize,
    /// Current send level (0.0 to 1.0)
    pub value: f64,
    /// Whether this send is active
    pub is_active: bool,
}

// ─────────────────────────────────────────────
// Clips & Samples
// ─────────────────────────────────────────────

/// Summary of a clip on a track.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct ClipSummary {
    /// Stable clip identity when available from XML @Id
    #[serde(default)]
    pub clip_id: Option<String>,
    /// Source clip type: AudioClip or MidiClip
    #[serde(default)]
    pub clip_type: Option<String>,
    /// Clip name (if set)
    pub name: String,
    /// Start time in beats
    pub start_time: f64,
    /// End time in beats
    pub end_time: f64,
    /// Clip color index
    pub color: i32,
    /// MIDI notes for MidiClip entries
    #[serde(default)]
    pub midi_notes: Vec<MidiNote>,
    /// Sample reference for audio clips
    pub sample_ref: Option<SampleReference>,
}

/// MIDI note summary extracted from a MidiClip.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct MidiNote {
    pub pitch: i32,
    pub start_beat: f64,
    pub duration_beats: f64,
    pub velocity: i32,
    #[serde(default)]
    pub note_id: Option<String>,
}

/// Reference to an audio sample file.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct SampleReference {
    /// Filename or display name
    pub name: String,
    /// Relative path within the project
    pub relative_path: String,
    /// OriginalCrc value — the true identity of the audio content.
    /// If this changes, the sample was replaced even if the filename is the same.
    pub original_crc: String,
}

// ─────────────────────────────────────────────
// Diff Report (output protocol)
// ─────────────────────────────────────────────

/// The top-level diff report returned to the frontend.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DiffReport {
    /// Summary statistics
    pub stats: DiffStats,
    /// Hierarchical list of changes
    pub changes: Vec<ChangeNode>,
    /// The parsed current project (for track info display)
    pub project: Project,
}

/// Aggregate statistics about the diff.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DiffStats {
    pub added: usize,
    pub removed: usize,
    pub modified: usize,
    pub moved: usize,
    pub renamed: usize,
}

impl DiffStats {
    pub fn new() -> Self {
        Self {
            added: 0,
            removed: 0,
            modified: 0,
            moved: 0,
            renamed: 0,
        }
    }
}

/// A single node in the hierarchical change tree.
/// Can represent changes at any level: Track, Device, Parameter, Sample, Routing.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChangeNode {
    /// What kind of thing changed: "Track", "Device", "Parameter", "Sample", "Routing", "Send", "Clip"
    #[serde(rename = "type")]
    pub change_type: String,

    /// The XML Id of the changed item, if applicable
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,

    /// Human-readable label (e.g. track name, device name, parameter name)
    pub label: String,

    /// The action: "added", "removed", "modified", "renamed", "moved",
    /// "instrument_swap", "value_change", "likely_rename", "sample_replaced"
    pub action: String,

    /// Context string (e.g. "Main Chain", parent device name)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,

    /// Previous value (for value_change, renamed, moved)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,

    /// New value
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,

    /// Confidence score for fuzzy matches (0.0 to 1.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,

    /// Child changes (e.g. devices within a track, parameters within a device)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<ChangeNode>,
}

impl ChangeNode {
    pub fn new(change_type: &str, label: &str, action: &str) -> Self {
        Self {
            change_type: change_type.to_string(),
            id: None,
            label: label.to_string(),
            action: action.to_string(),
            context: None,
            from: None,
            to: None,
            confidence: None,
            children: Vec::new(),
        }
    }

    /// Create a simple value change node
    pub fn value_change(change_type: &str, label: &str, from: &str, to: &str) -> Self {
        Self {
            change_type: change_type.to_string(),
            id: None,
            label: label.to_string(),
            action: "value_change".to_string(),
            context: None,
            from: Some(from.to_string()),
            to: Some(to.to_string()),
            confidence: None,
            children: Vec::new(),
        }
    }
}
