import { dialog } from 'electron';
import zlib from 'zlib';
import fs from 'fs';
import { XMLParser } from 'fast-xml-parser';

async function chooseFile(mainWindow) {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Choose clone destination',
    filters: [
      { name: 'Ableton Live Set', extensions: ['als'] },
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}

function toArray(x) {
  if (x === undefined || x === null) return [];
  if (Array.isArray(x)) return x;
  const keys = Object.keys(x);
  if (keys.length && keys.every((k) => !isNaN(k))) {
    return keys.map((k) => x[k]);
  }
  return [x];
}

function findAllByName(obj, name) {
  const out = [];
  if (!obj || typeof obj !== "object") return out;
  if (Object.prototype.hasOwnProperty.call(obj, name)) {
    out.push(...toArray(obj[name]));
  }
  for (const v of Object.values(obj)) {
    if (typeof v === "object") out.push(...findAllByName(v, name));
  }
  return out;
}

function clipIdentifier(clipNode) {
  // Try to extract the relative path (most common and useful)
  const relativePath =
    clipNode?.SampleRef?.[0]?.FileRef?.[0]?.RelativePath?.[0]?.["@_Value"]?.[0] ??
    clipNode?.SampleRef?.[0]?.FileRef?.[0]?.RelativePath?.[0];
  if (relativePath) {
    // Strip leading "Samples/" if present
    let cleanedPath = relativePath.replace(/^Samples[\\/]/, "");
    return cleanedPath;
  }

  // Fall back to LomId (internal Ableton reference)
  const lom =
    clipNode?.LomId?.[0]?.["@_Value"]?.[0] ?? clipNode?.LomId?.[0];
  if (lom) return `lom:${lom}`;

  // Fall back to SampleRef ID
  const sampleRef = clipNode?.SampleRef ?? clipNode?.Sample?.[0]?.SampleRef;
  const sampleRefAttr =
    sampleRef?.[0]?.["@_Ref"] ?? sampleRef?.["@_Ref"] ?? null;
  if (sampleRefAttr) return `sref:${sampleRefAttr}`;

  // Fall back to clip name (sometimes used for audio loops)
  const name = clipNode?.Name?.[0]?.["@_Value"] ?? clipNode?.Name?.[0];
  if (name) return name;

  // Fall back to file path fields
  const filePath =
    clipNode?.FileRef?.[0]?.Path?.[0] ??
    clipNode?.SampleName?.[0] ??
    null;
  if (filePath) return filePath;

  // Last resort: JSON stringify
  try {
    return `raw:${JSON.stringify(clipNode)}`;
  } catch {
    return "unknown";
  }
}

function countSampleUsage(xmlDoc) {
  const eventsNodes = findAllByName(xmlDoc, "Events");
  const audioClips = [];
  for (const eventsNode of eventsNodes) {
    const clips = findAllByName(eventsNode, "AudioClip");
    audioClips.push(...clips);
  }

  const counts = new Map();
  for (const clip of audioClips) {
    const clipObjs = toArray(clip);
    for (const c of clipObjs) {
      const id = clipIdentifier(c);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }

  const sampleNameMap = new Map();
  const samples = toArray(xmlDoc?.Sample);
  samples.forEach((sample, idx) => {
    const lom =
      sample?.LomId?.[0]?.["@_Value"]?.[0] ?? sample?.LomId?.[0];
    const sampleRefAttr =
      sample?.["@_Ref"] ?? sample?.SampleRef?.[0]?.["@_Ref"] ?? null;
    const name =
      sample?.Name?.[0]?.["@_Value"]?.[0] ??
      sample?.Name?.[0] ??
      `Sample ${idx + 1}`;

    if (lom) sampleNameMap.set(`lom:${lom}`, name);
    if (sampleRefAttr) sampleNameMap.set(`sref:${sampleRefAttr}`, name);
    sampleNameMap.set(`name:${name}`, name);
  });

  const result = Array.from(counts.entries())
    .map(([id, count]) => ({
      id,
      name:
        sampleNameMap.get(id) ??
        id.replace(/^raw:/, "").slice(0, 60),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return { totalClips: audioClips.length, bySample: result };
}

function getAlsContent(alsPath) {
  return new Promise((resolve, reject) => {
    const input = fs.readFileSync(alsPath);

    zlib.gunzip(input, (err, decompressed) => {
      if (err) {
        return "Could not open ALS file.";
      }

      const parser = new XMLParser({
        ignoreAttributes: false,
        isArray: (name, jpath, isLeafNode, isAttribute) => true,
      });

      const xmlDoc = parser.parse(decompressed.toString());
      const ableton = xmlDoc?.Ableton?.[0];
      const tracks = ableton?.LiveSet?.[0]?.Tracks?.[0];

      var returnString = "Ableton Live Set\n";
      returnString += "Version: " + (ableton?.["@_MajorVersion"]?.[0] ?? "unknown") + "." + (ableton?.["@_MinorVersion"]?.[0] ?? "unknown") + "\n";
      returnString += "Created with: " + (ableton?.["@_Creator"]?.[0] ?? "unknown") + "\n\n";

      returnString += "Tracks:\n";
      returnString += (tracks?.MidiTrack?.length ?? 0) + " MIDI tracks\n";
      returnString += (tracks?.AudioTrack?.length ?? 0) + " Audio tracks\n";
      returnString += (tracks?.ReturnTrack?.length ?? 0) + " Return tracks\n\n";

      const { bySample, totalClips } = countSampleUsage(xmlDoc);

      returnString += `Samples used:\n`;
      if (bySample.length === 0) {
        returnString += "No samples or clips found.\n\n";
      } else {
        bySample.forEach((entry) => {
          returnString += `${entry.name}: used ${entry.count} time${
            entry.count !== 1 ? "s" : ""
          }\n`;
        });
        returnString += `\nTotal Samples: ${totalClips}\n\n`;
      }

      resolve(returnString);
    });
  });
}

export {
  chooseFile,
  getAlsContent
};