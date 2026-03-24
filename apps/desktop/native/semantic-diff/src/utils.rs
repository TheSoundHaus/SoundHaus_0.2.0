use std::fs::File;
use std::io::{BufRead, BufReader, Cursor, Read, Seek, SeekFrom};

use flate2::read::GzDecoder;

/// Create a buffered reader from a file path, with streaming gzip decompression
/// if the file starts with the gzip magic bytes (0x1f, 0x8b).
///
/// This avoids reading the entire decompressed file into memory at once,
/// which is critical for 100MB+ Ableton project files.
pub fn streaming_reader_from_path(path: &str) -> Result<Box<dyn BufRead>, String> {
    let mut file = File::open(path)
        .map_err(|e| format!("Failed to open file '{}': {}", path, e))?;

    // Read the first 2 bytes to detect gzip
    let mut magic = [0u8; 2];
    let bytes_read = file
        .read(&mut magic)
        .map_err(|e| format!("Failed to read magic bytes: {}", e))?;

    // Seek back to start
    file.seek(SeekFrom::Start(0))
        .map_err(|e| format!("Failed to seek: {}", e))?;

    if bytes_read >= 2 && magic[0] == 0x1f && magic[1] == 0x8b {
        // Gzip compressed — wrap in streaming GzDecoder
        let decoder = GzDecoder::new(file);
        Ok(Box::new(BufReader::new(decoder)))
    } else {
        // Plain XML
        Ok(Box::new(BufReader::new(file)))
    }
}

/// Create a buffered reader from an in-memory buffer, with streaming gzip
/// decompression if the buffer starts with gzip magic bytes.
pub fn streaming_reader_from_buffer(data: &[u8]) -> Result<Box<dyn BufRead + '_>, String> {
    if data.len() >= 2 && data[0] == 0x1f && data[1] == 0x8b {
        let decoder = GzDecoder::new(Cursor::new(data));
        Ok(Box::new(BufReader::new(decoder)))
    } else {
        Ok(Box::new(BufReader::new(Cursor::new(data))))
    }
}

/// Extract the text content of a Value attribute from a quick-xml event.
/// Looks for `Value="..."` and returns the inner string.
pub fn get_attr_value(event: &quick_xml::events::BytesStart<'_>, attr_name: &[u8]) -> Option<String> {
    event
        .try_get_attribute(attr_name)
        .ok()
        .flatten()
        .map(|a| String::from_utf8_lossy(&a.value).into_owned())
}

/// Extract the @Id attribute from an XML element.
pub fn get_id(event: &quick_xml::events::BytesStart<'_>) -> Option<String> {
    get_attr_value(event, b"Id")
}

/// Normalized Levenshtein distance between two strings (0.0 = identical, 1.0 = completely different).
/// Returns the similarity score (1.0 - normalized_distance), so higher = more similar.
pub fn name_similarity(a: &str, b: &str) -> f64 {
    strsim::normalized_levenshtein(a, b)
}

/// Confidence threshold for "likely rename" detection.
pub const LIKELY_RENAME_THRESHOLD: f64 = 0.8;
