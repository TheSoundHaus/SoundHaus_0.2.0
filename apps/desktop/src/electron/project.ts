import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';
import * as path from 'path';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import type { DecompressedAls, AlsCompareOptions, AlsDeviceHint, AlsChange, StructuralCompareResult, AudioTrackEntry, MidiTrackEntry, AnyTrackEntry, MainInstrumentInfo } from '../types'

// Provide a stable Promise-based gunzip function.
// Use the callback API and wrap it in a Promise for compatibility across Node versions.
const gunzip: (data: Buffer) => Promise<Buffer> = (buf: Buffer) =>
    new Promise<Buffer>((resolve, reject) => {
        zlib.gunzip(buf, (err, result) => (err ? reject(err) : resolve(result as Buffer)));
    });

const execFileP = promisify(execFile);

const platformMap: Partial<Record<NodeJS.Platform, string>> = {
  win32: 'windows',
  darwin: 'macos',
  linux: 'linux',
};

const platformDir = platformMap[process.platform] || process.platform;
const envGit = process.env.SOUNDHAUS_GIT_BIN;
let gitBin = envGit || path.join(__dirname, '..', 'vendor', 'git', platformDir, process.platform === 'win32' ? 'git.exe' : 'git');
try {
  // fs is imported above as default export
  if (gitBin !== 'git' && !fs.existsSync(gitBin)) {
    console.warn('Configured git binary not found at', gitBin, '— falling back to system `git` in PATH');
    gitBin = 'git';
  }
} catch (e) {
  gitBin = 'git';
}

async function decompressAls(alsPath: string): Promise<DecompressedAls> {
    const buf = await fs.promises.readFile(alsPath);

    // Detected if file is able to be decompressed via gunzip
    // This can be done by checking two bytes at the beginning of the file
    // This indicates file format
    let decompressed: Buffer;
    if(buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
        decompressed = await gunzip(buf);
    }
    else {
        decompressed = buf;
    }

    const text = decompressed.toString('utf-8');
    const hash = crypto.createHash('sha256').update(decompressed).digest('hex');

    return { buffer: decompressed, text, hash }
}

async function getAlsFromGitHead(repoPath: string, relativeAlsPath: string): Promise<{ buffer: Buffer; text: string; hash: string }> {
    // Use bundled git binary; run in repoPath with -C to be safe
    const args = ['-C', repoPath, 'show', `HEAD:${relativeAlsPath}`];
    // Request raw buffer output to detect gzip magic bytes reliably
    const opts = { encoding: 'buffer' as const, maxBuffer: 50 * 1024 * 1024 };

    // execFileP is the promisified execFile defined earlier in the file.
    // The return type isn't strongly typed by promisify, so cast to the expected shape.
    const execResult = (await execFileP(gitBin, args, opts)) as { stdout: Buffer; stderr?: Buffer | string };

    const buf = Buffer.from(execResult.stdout);
    // detect gzip by magic bytes 0x1f 0x8b
    let decompressedBuf: Buffer;
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
        // gunzip is the promisified/gzip-aware function in the surrounding module
        decompressedBuf = await gunzip(buf);
    } else {
        decompressedBuf = buf;
    }

    const text = decompressedBuf.toString('utf8');
    const hash = crypto.createHash('sha256').update(decompressedBuf).digest('hex');

    return { buffer: decompressedBuf, text, hash };
}

function structuralCompareAls(localXmlText: string, headXmlText: string, options: AlsCompareOptions = {}): StructuralCompareResult {
    const localAbleton = parseXmlTextToObj(localXmlText);
    const headAbleton = parseXmlTextToObj(headXmlText);
    if (!localAbleton || !headAbleton) return { ok: false, reason: 'Could not parse XML' };

    const localTracks = collectAllTracks(localAbleton);
    const headTracks = collectAllTracks(headAbleton);

    // Index head tracks by id (if present) or name as fallback
    const headIndexById = new Map<string, any>();
    const headIndexByName = new Map<string, any>();
    headTracks.forEach(t => {
        if (t.id !== undefined && t.id !== null) headIndexById.set(String(t.id), t);
        headIndexByName.set(t.name, t);
    });

    const changes: AlsChange[] = [];

    for (let i = 0; i < localTracks.length; i++) {
        const lt = localTracks[i];
        let ht = lt.id ? headIndexById.get(String(lt.id)) : headIndexByName.get(lt.name);
        // fallback to positional/index matching if id/name didn't match
        if (!ht && headTracks[i]) ht = headTracks[i];
        if (!ht) continue;

        const localInst = getMainInstrumentFromTrack(lt.node);
        const headInst = getMainInstrumentFromTrack(ht.node);

        // Fallback extractor for visible names / presets if main extractor finds nothing
        const extractAnyPresetName = (trackNode: any): string | null => {
        if (!trackNode) return null;

        const readString = (v: any): string | null => {
            if (!v) return null;
            if (typeof v === 'string') return v;
            if (Array.isArray(v) && v.length > 0) {
            const first = v[0];
            if (typeof first === 'string') return first;
            if (first && first['@_Value']) return first['@_Value']?.[0] ?? null;
            return null;
            }
            if (v['@_Value']) return v['@_Value']?.[0] ?? null;
            return null;
        };

        const candidates: any[] = [];

        const igs = findAllByName(trackNode, 'InstrumentGroupDevice');
        for (const ig of toArray(igs)) {
            const node = toArray(ig)[0] || ig;
            const poi = node?.Pointee ? toArray(node.Pointee)[0] : null;
            if (poi && (poi.UserName || poi.PresetName || poi.LastPresetRef || poi.Devices)) candidates.push(poi);
            else candidates.push(node);
        }

        const devs = findAllByName(trackNode, 'Device');
        for (const d of toArray(devs)) candidates.push(toArray(d)[0] || d);

        for (const cand of candidates) {
            if (!cand || typeof cand !== 'object') continue;
            const uname = readString(cand?.UserName?.[0]) || readString(cand?.PresetName?.[0]) || readString(cand?.EffectiveName?.[0]) || readString(cand?.Name?.[0]);
            if (uname && uname.trim()) return uname.trim();

            const lastRefs = findAllByName(cand, 'LastPresetRef');
            if (lastRefs && lastRefs.length) {
                for (const lr of toArray(lastRefs)) {
                    const candidate = toArray(lr)[0];
                    const v = candidate?.Value?.[0];
                    const rel = readString(v) ||
                                (candidate?.Value?.[0]?.FilePresetRef?.[0]?.FileRef?.[0]?.RelativePath?.[0]?.['@_Value']?.[0]) ||
                                candidate?.Value?.[0]?.FilePresetRef?.[0]?.FileRef?.[0]?.RelativePath?.[0] ||
                                (candidate?.Value?.[0]?.FilePresetRef?.[0]?.FileRef?.[0]?.Path?.[0]);
                    if (rel && typeof rel === 'string' && rel.trim()) return rel.trim();
                }
            }
        }

        return null;
        };

        const localDeviceNamePrimary = (localInst?.preset ?? localInst?.deviceType) ?? null;
        const headDeviceNamePrimary = (headInst?.preset ?? headInst?.deviceType) ?? null;

        // helper to find SourceContext relative path from a track node
        const findSourceContextPathForTrack = (trackNode: any): string | null => {
        try {
            const scs = findAllByName(trackNode, 'SourceContext');
            for (const sc of toArray(scs)) {
            const s = toArray(sc)[0] || sc;
            const val = s?.Value?.[0];
            const branch = val?.BranchSourceContext ? toArray(val.BranchSourceContext)[0] : val?.BranchSourceContext;
            const orig = branch?.OriginalFileRef ? toArray(branch.OriginalFileRef)[0] : branch?.OriginalFileRef;
            const fileref = orig?.FileRef ? toArray(orig.FileRef)[0] : orig?.FileRef;
            const rel = fileref?.RelativePath ? (typeof fileref.RelativePath[0] === 'string' ? fileref.RelativePath[0] : (fileref.RelativePath[0]?.['@_Value']?.[0] || fileref.RelativePath[0])) : null;
            const p = fileref?.Path ? (typeof fileref.Path[0] === 'string' ? fileref.Path[0] : (fileref.Path[0]?.['@_Value']?.[0] || fileref.Path[0])) : null;
            if (rel && typeof rel === 'string' && rel.trim()) return rel.trim();
            if (p && typeof p === 'string' && p.trim()) return p.trim();
            }
        } catch (e) { /* ignore */ }
        return null;
        };

        const localDeviceName = localDeviceNamePrimary ?? extractAnyPresetName(lt.node) ?? findSourceContextPathForTrack(lt.node) ?? null;
        const headDeviceName = headDeviceNamePrimary ?? extractAnyPresetName(ht.node) ?? findSourceContextPathForTrack(ht.node) ?? null;

        const localName = localDeviceName ?? (options.allowTrackNameFallback ? (lt.node?.Name?.[0]?.EffectiveName?.[0]?.['@_Value']?.[0] || lt.node?.Name?.[0]) : null) ?? 'unknown';
        const headName = headDeviceName ?? (options.allowTrackNameFallback ? (ht.node?.Name?.[0]?.EffectiveName?.[0]?.['@_Value']?.[0] || ht.node?.Name?.[0]) : null) ?? 'unknown';

        if (localName !== headName) {
        const readInstName = (inst: any): string | null => {
            if (!inst) return null;
            return inst.name || inst.preset || null;
        };

        const beforeInstrument = readInstName(headInst) || null;
        const afterInstrument = readInstName(localInst) || null;

        const readTrackName = (node: any, fallback: string | null): string | null => {
            if (!node) return fallback ?? null;
            const val = node?.Name?.[0]?.EffectiveName?.[0]?.['@_Value']?.[0] || node?.Name?.[0] || null;
            return val ?? fallback ?? null;
        };

        const beforeTrackName = readTrackName(ht?.node, null);
        const afterTrackName = readTrackName(lt?.node, lt.name || null);

        const beforeObj: AlsDeviceHint = { name: beforeInstrument ?? null };
        const afterObj: AlsDeviceHint = { name: afterInstrument ?? null };

        if ((!beforeObj.name || beforeObj.name === null) && beforeTrackName) {
            beforeObj.trackHint = beforeTrackName;
        }

        changes.push({
            trackId: lt.id ?? null,
            trackName: afterTrackName ?? lt.name,
            beforeTrackName: beforeTrackName ?? null,
            afterTrackName: afterTrackName ?? null,
            before: beforeObj,
            after: afterObj,
        });
        }
    }

    return { ok: true, changes };
}

async function getAlsContent(alsPath: string): Promise<string> {
  // Read file as Buffer
  const input: Buffer = await fs.promises.readFile(alsPath);

  // Decompress (wrap callback API so we can await it)
  const decompressed: Buffer = await new Promise<Buffer>((resolve, reject) => {
    zlib.gunzip(input, (err, result) => {
      if (err) {
        return reject(new Error("Could not open ALS file."));
      }
      resolve(result as Buffer);
    });
  });

  // Parse XML forcing arrays for nodes (matches original behavior)
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (_name: string, _jpath: string, _isLeafNode: boolean, _isAttribute: boolean) => true,
  });

  const xmlDoc: any = parser.parse(decompressed.toString());
  const ableton = xmlDoc?.Ableton?.[0];
  const tracks = ableton?.LiveSet?.[0]?.Tracks?.[0];

  let returnString = "Ableton Live Set\n";
  const major = ableton?.["@_MajorVersion"]?.[0] ?? "unknown";
  const minor = ableton?.["@_MinorVersion"]?.[0] ?? "unknown";
  const creator = ableton?.["@_Creator"]?.[0] ?? "unknown";

  returnString += `Version: ${major}.${minor}\n`;
  returnString += `Created with: ${creator}\n\n`;

  returnString += "Tracks:\n";
  returnString += `${tracks?.MidiTrack?.length ?? 0} MIDI tracks\n`;
  returnString += `${tracks?.AudioTrack?.length ?? 0} Audio tracks\n`;
  returnString += `${tracks?.ReturnTrack?.length ?? 0} Return tracks\n\n`;

  // countSampleUsage is assumed to be available in scope and typed as:
  // function countSampleUsage(xmlDoc: any): { bySample: { name: string; count: number }[]; totalClips: number; }
  const { bySample, totalClips } = countSampleUsage(xmlDoc);

  returnString += `Samples used:\n`;
  if (bySample.length === 0) {
    returnString += "No samples or clips found.\n\n";
  } else {
    bySample.forEach((entry: { name: string; count: number }) => {
      returnString += `${entry.name}: used ${entry.count} time${entry.count !== 1 ? "s" : ""}\n`;
    });
    returnString += `\nTotal Samples: ${totalClips}\n\n`;
  }

  return returnString;
}

function pull(repoPath: string) {
  return new Promise((resolve, reject) => {
    const cmd = `"${gitBin}" pull origin main`;
    exec(cmd, {cwd: repoPath}, (err, stdout, stderr) => {
      if(err) {
        reject(stderr);
        return;
      }
      resolve(stdout);
    });
  });
}

function commit(repoPath: string) {
  return new Promise((resolve, reject) => {
    const cmds = [
      `"${gitBin}" add .`,
      `"${gitBin}" commit -m "Auto-commit from Electron app"`,
    ];
    const cmd = cmds.join(' && ');

    exec(cmd, { cwd: repoPath }, (err, stdout, stderr) => {
      if(err) {
        reject(stderr);
        return;
      }
      resolve(stdout);
    });
  })
}

function push(repoPath: string) {
  return new Promise((resolve, reject) => {
    const cmds = [
      `"${gitBin}" add .`,
      `"${gitBin}" commit -m "Auto-commit from Electron app"`,
      `"${gitBin}" push origin HEAD`
    ];
    const cmd = cmds.join(' && ');

    exec(cmd, { cwd: repoPath }, (err, stdout, stderr) => {
      if(err) {
        reject(stderr);
        return;
      }
      resolve(stdout);
    });
  });
}

export {
    decompressAls,
    execFileP,
    getAlsFromGitHead,
    structuralCompareAls,
    getAlsContent,
    pull,
    commit,
    push
};

function parseXmlTextToObj(xmlText: string): Record<string, any> | null {
    const parser = new XMLParser({ ignoreAttributes: false, isArray: () => true });
    try {
        const parsed = parser.parse(xmlText) as Record<string, any> | null | undefined;
        if (!parsed) return null;

        const ableton = parsed['Ableton'];
        if (!ableton) return null;

        // Because isArray: () => true, Ableton is expected to be an array; return the first element.
        if (Array.isArray(ableton) && ableton.length > 0) {
            return ableton[0] as Record<string, any>;
        }

        // Fallback: return whatever Ableton is (in case parser options change)
        return ableton as Record<string, any>;
    } catch (e) {
        return null;
    }
}

function collectAllTracks(abletonObj: Record<string, any> | null | undefined): AnyTrackEntry[] {
    // Guard: if no ableton object provided, return empty array
    if (!abletonObj) return [];

    // Tracks container is usually at Ableton.LiveSet[0].Tracks[0]
    const tracks = abletonObj?.LiveSet?.[0]?.Tracks?.[0];

    // toArray helper ensures we get an array even when parser returned single object
    const midiArr = toArray(tracks?.MidiTrack || []);
    const audioArr = toArray(tracks?.AudioTrack || []);

    const audio: AudioTrackEntry[] = audioArr.map((trk: any, idx: number) => ({
        id: trk?.['@_Id']?.[0] ?? trk?.Id ?? null,
        name: extractName(trk, `Audio ${idx + 1}`),
        node: trk,
        type: 'Audio',
        typeIndex: idx + 1,
    }));

    const midi: MidiTrackEntry[] = midiArr.map((trk: any, idx: number) => ({
        id: trk?.['@_Id']?.[0] ?? trk?.Id ?? null,
        name: extractName(trk, `MIDI ${idx + 1}`),
        node: trk,
        type: 'MIDI',
        typeIndex: idx + 1,
    }));

    // Return audio first then midi to preserve original ordering intent
    return [...audio, ...midi];
}

export function toArray<T = any>(x: T | T[] | Record<string, any> | null | undefined): T[] {
    if (x === undefined || x === null) return [];
    if (Array.isArray(x)) return x as T[];

    // If it's not an object (primitive), wrap it.
    if (typeof x !== 'object') return [x as T];

    // Handle objects with numeric keys (e.g. { "0": ..., "1": ... })
    const keys = Object.keys(x);
    if (keys.length > 0 && keys.every((k) => !isNaN(Number(k)))) {
        // Sort numeric keys so ordering is stable (0,1,2,...)
        const sorted = keys
        .map((k) => Number(k))
        .sort((a, b) => a - b)
        .map((n) => String(n));
        return sorted.map((k) => (x as any)[k]) as T[];
    }

    // Fallback: wrap the object itself
    return [x as T];
}

function extractName(node: any, defaultName = ''): string {
    const safeFirst = (v: any): any => {
        if (v === undefined || v === null) return undefined;
        if (Array.isArray(v)) return v[0];
        return v;
    };

    const readValue = (v: any): string | undefined => {
        if (v === undefined || v === null) return undefined;
        if (typeof v === 'string') return v;
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
        // nested attribute object { "@_Value": [ "..." ] } or { "@_Value": "..." }
        if (typeof v === 'object') {
        const attr = v['@_Value'];
        if (attr !== undefined && attr !== null) {
            if (Array.isArray(attr) && attr.length > 0 && typeof attr[0] === 'string') return attr[0];
            if (typeof attr === 'string') return attr;
        }
        }
        return undefined;
    };

    const nameNode = safeFirst(node?.Name);
    const effNode = safeFirst(nameNode?.EffectiveName);

    // 1) EffectiveName["@_Value"]
    const effVal = readValue(effNode?.['@_Value'] ?? effNode);
    if (effVal !== undefined) return String(effVal);

    // 2) Name["@_Value"]
    const nameVal = readValue(nameNode?.['@_Value'] ?? nameNode);
    if (nameVal !== undefined) return String(nameVal);

    // 3) fallback to provided defaultName (ensure string)
    return defaultName ?? '';
}

function findDeviceInContainer(container: any): any | null {
    if (!container || typeof container !== 'object') return null;

    // Direct Device array
    if (container.Device) return toArray(container.Device)[0];

    // InstrumentGroupDevice -> Devices -> Device
    if (container.InstrumentGroupDevice) {
        const ig = toArray(container.InstrumentGroupDevice)[0];
        if (ig) {
        // sometimes the actual device lives under a Pointee wrapper
        const pointee = ig.Pointee ? toArray(ig.Pointee)[0] : null;
        const probe = pointee || ig;
        // If probe looks device-like (has a UserName / ShouldShowPresetName / LastPresetRef), treat it as the device
        if (probe && (probe.UserName || probe.ShouldShowPresetName || probe.LastPresetRef)) return probe;
        if (probe && probe.Devices) {
            const inner = toArray(probe.Devices)[0];
            if (inner && inner.Device) return toArray(inner.Device)[0];
        }
        }
    }

    // Some ALS use Devices -> InstrumentGroupDevice (wrapped)
    if (container.InstrumentGroupDevice === undefined && container.Devices && container.Devices.InstrumentGroupDevice) {
        const ig = toArray(container.Devices.InstrumentGroupDevice)[0];
        if (ig) {
        const pointee = ig.Pointee ? toArray(ig.Pointee)[0] : null;
        const probe = pointee || ig;
        if (probe && probe.Devices) {
            const inner = toArray(probe.Devices)[0];
            if (inner && inner.Device) return toArray(inner.Device)[0];
        }
        }
    }

    // Fallback: scan any nested 'Device' key
    const anyDevices = findAllByName(container, 'Device');
    if (anyDevices && anyDevices.length) return toArray(anyDevices[0])[0] || anyDevices[0];

    return null;
}

function getMainInstrumentFromTrack(trackNode: any): MainInstrumentInfo | null {
    // Search for Devices under DeviceChain
    const deviceChains = findAllByName(trackNode, 'DeviceChain');
    if (!deviceChains || deviceChains.length === 0) return null;

    let firstDev: any = null;

    // Try multiple DeviceChain entries — some ALS files nest device chains
    for (const dcEntry of toArray(deviceChains)) {
        const dcNode = toArray(dcEntry)[0] || dcEntry;
        // find Devices nodes under this DeviceChain node
        const devicesNodes = findAllByName(dcNode, 'Devices');
        for (const dn of toArray(devicesNodes)) {
        const devicesContainer = toArray(dn)[0] ?? dn;
        const candidate = findDeviceInContainer(devicesContainer);
        if (candidate) { firstDev = candidate; break; }
        }
        if (firstDev) break;
    }

    // Fallback: search anywhere in the track for Device nodes
    if (!firstDev) {
        const igs = findAllByName(trackNode, 'InstrumentGroupDevice');
        if (igs && igs.length) {
        const ig = toArray(igs[0])[0] || igs[0];
        const pointee = ig?.Pointee ? toArray(ig.Pointee)[0] : null;
        const probe = (pointee && (pointee.UserName || pointee.LastPresetRef || pointee.Devices)) ? pointee : ig;
        if (probe && (probe.UserName || probe.LastPresetRef || probe.ShouldShowPresetName || probe.Devices)) {
            firstDev = probe;
        }
        }
        if (!firstDev) {
        const anyDevices = findAllByName(trackNode, 'Device');
        if (anyDevices && anyDevices.length) firstDev = toArray(anyDevices[0])[0] || anyDevices[0];
        }
    }

    if (!firstDev) {
        return null;
    }

    // Helper to read common string shapes from parser output
    const tryStr = (v: any): string | null => {
        if (!v) return null;
        if (typeof v === 'string') return v;
        if (Array.isArray(v)) {
        const first = v[0];
        if (typeof first === 'string') return first;
        if (first && first['@_Value']) return first['@_Value']?.[0] ?? null;
        return null;
        }
        if (v['@_Value']) return v['@_Value']?.[0] ?? null;
        return null;
    };

    // Try to extract preset or file reference name with multiple fallbacks
    let preset = tryStr(firstDev?.FileRef?.[0]?.RelativePath?.[0]) || tryStr(firstDev?.PresetName?.[0]) || null;

    // LastPresetRef may appear deeper in some devices
    if (!preset) {
        const lastRefs = findAllByName(firstDev, 'LastPresetRef');
        if (lastRefs && lastRefs.length) {
        const v = toArray(lastRefs[0])[0];
        // Try common nested shapes: Value may be string or an object with FilePresetRef -> FileRef -> RelativePath
        preset = tryStr(v?.Value?.[0]) ||
                tryStr(v?.Value?.[0]?.FilePresetRef?.[0]?.FileRef?.[0]?.RelativePath?.[0]) ||
                tryStr(v?.Value?.[0]?.FilePresetRef?.[0]?.FileRef?.[0]?.Path?.[0]) ||
                tryStr(v) || preset;
        }
    }

    // Some devices store a UserName / EffectiveName for presets/plugins
    const userName = tryStr(firstDev?.UserName?.[0]) || tryStr(firstDev?.EffectiveName?.[0]) || tryStr(firstDev?.Name?.[0]);
    if (!preset && userName) preset = userName;

    // final fallback: friendly extractName on the device node
    if (!preset) preset = extractName(firstDev);

    // Try to extract SourceContext path (OriginalFileRef -> FileRef -> RelativePath or Path)
    const findSourceContextPath = (node: any): string | null => {
        if (!node || typeof node !== 'object') return null;
        const scs = findAllByName(node, 'SourceContext');
        for (const sc of toArray(scs)) {
        const s = toArray(sc)[0] || sc;
        const val = s?.Value?.[0];
        const branch = val?.BranchSourceContext ? toArray(val.BranchSourceContext)[0] : val?.BranchSourceContext;
        const orig = branch?.OriginalFileRef ? toArray(branch.OriginalFileRef)[0] : branch?.OriginalFileRef;
        const fileref = orig?.FileRef ? toArray(orig.FileRef)[0] : orig?.FileRef;
        const rel = fileref?.RelativePath ? (tryStr(fileref.RelativePath[0]) || fileref.RelativePath[0]) : null;
        const p = fileref?.Path ? (tryStr(fileref.Path[0]) || fileref.Path[0]) : null;
        if (rel && typeof rel === 'string' && rel.trim()) return rel.trim();
        if (p && typeof p === 'string' && p.trim()) return p.trim();
        }
        return null;
    };

    let sourcePath = findSourceContextPath(firstDev) || null;

    // If not found on the device node itself, try searching the whole track for SourceContext
    if (!sourcePath) {
        try {
        const scsTrack = findAllByName(trackNode, 'SourceContext');
        if (scsTrack && scsTrack.length) {
            for (const sc of toArray(scsTrack)) {
            const s = toArray(sc)[0] || sc;
            const val = s?.Value?.[0];
            const branch = val?.BranchSourceContext ? toArray(val.BranchSourceContext)[0] : val?.BranchSourceContext;
            const orig = branch?.OriginalFileRef ? toArray(branch.OriginalFileRef)[0] : branch?.OriginalFileRef;
            const fileref = orig?.FileRef ? toArray(orig.FileRef)[0] : orig?.FileRef;
            const rel = fileref?.RelativePath ? (tryStr(fileref.RelativePath[0]) || fileref.RelativePath[0]) : null;
            const p = fileref?.Path ? (tryStr(fileref.Path[0]) || fileref.Path[0]) : null;
            if (rel && typeof rel === 'string' && rel.trim()) { sourcePath = rel.trim(); break; }
            if (p && typeof p === 'string' && p.trim()) { sourcePath = p.trim(); break; }
            }
        }
        } catch (e) {
        // ignore
        }
    }

    // If LastPresetRef provided a more specific file path, prefer it
    if (!sourcePath) {
        const lastRefs = findAllByName(firstDev, 'LastPresetRef');
        if (lastRefs && lastRefs.length) {
        for (const lr of toArray(lastRefs)) {
            const candidate = toArray(lr)[0];
            const rel = candidate?.Value?.[0]?.FilePresetRef?.[0]?.FileRef?.[0]?.RelativePath?.[0]?.['@_Value']?.[0] ||
                        candidate?.Value?.[0]?.FilePresetRef?.[0]?.FileRef?.[0]?.RelativePath?.[0] ||
                        tryStr(candidate?.Value?.[0]);
            if (rel && typeof rel === 'string' && rel.trim()) { sourcePath = rel.trim(); break; }
        }
        }
    }

    // Compute friendly name (prefer UserName, then basename of sourcePath, then preset)
    const basename = (p: string | null | undefined): string | null => {
        if (!p || typeof p !== 'string') return null;
        const parts = p.split(/[\\/]/).filter(Boolean);
        if (parts.length === 0) return p.replace(/\.(adg|adv)$/, '');
        const last = parts[parts.length - 1];
        return last.replace(/\.(adg|adv)$/, '');
    };

    const friendlyName = userName || (sourcePath ? basename(sourcePath) : null) || preset || null;

    const deviceType = firstDev?.['#name'] ?? tryStr(firstDev?.Name?.[0]) ?? (firstDev?.DeviceType?.[0] ?? null);
    const res: MainInstrumentInfo = {
        deviceType: deviceType ?? null,
        preset: preset ?? null,
        name: friendlyName ?? null,
        path: sourcePath ?? null,
    };

    return res;
}

function findAllByName(obj: any, name: string): any[] {
    const out: any[] = [];
    if (!obj || typeof obj !== 'object') return out;

    // If this object directly has the requested key, normalize and add its contents
    if (Object.prototype.hasOwnProperty.call(obj, name)) {
        out.push(...toArray(obj[name]));
    }

    // Recurse into all child values
    for (const v of Object.values(obj)) {
        if (v && typeof v === 'object') {
        out.push(...findAllByName(v, name));
        }
    }

    return out;
}

function countSampleUsage(xmlDoc: any): {
  totalClips: number;
  bySample: { id: string; name: string; count: number }[];
} {
  // Gather all Events nodes and then all AudioClip nodes inside them
  const eventsNodes: any[] = findAllByName(xmlDoc, "Events");
  const audioClips: any[] = [];
  for (const eventsNode of eventsNodes) {
    const clips = findAllByName(eventsNode, "AudioClip");
    audioClips.push(...clips);
  }

  // Count occurrences per clip identifier
  const counts = new Map<string, number>();
  for (const clip of audioClips) {
    const clipObjs = toArray<any>(clip);
    for (const c of clipObjs) {
      const id = clipIdentifier(c);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  // Build a mapping from various sample identifiers to friendly names
  const sampleNameMap = new Map<string, string>();
  const samples = toArray<any>(xmlDoc?.Sample);
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

  // Convert counts to an array with resolved names and sort by usage desc
  const result = Array.from(counts.entries())
    .map(([id, count]) => ({
      id,
      name: sampleNameMap.get(id) ?? id.replace(/^raw:/, "").slice(0, 60),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return { totalClips: audioClips.length, bySample: result };
}

function clipIdentifier(clipNode: any): string {
  // Try to extract the relative path (most common and useful)
  const relativePath =
    clipNode?.SampleRef?.[0]?.FileRef?.[0]?.RelativePath?.[0]?.["@_Value"]?.[0] ??
    clipNode?.SampleRef?.[0]?.FileRef?.[0]?.RelativePath?.[0];

  if (relativePath) {
    // Strip leading "Samples/" if present
    const cleanedPath = String(relativePath).replace(/^Samples[\\/]/, "");
    return cleanedPath;
  }

  // Fall back to LomId (internal Ableton reference)
  const lom = clipNode?.LomId?.[0]?.["@_Value"]?.[0] ?? clipNode?.LomId?.[0];
  if (lom) return `lom:${String(lom)}`;

  // Fall back to SampleRef ID
  const sampleRef = clipNode?.SampleRef ?? clipNode?.Sample?.[0]?.SampleRef;
  const sampleRefAttr =
    sampleRef?.[0]?.["@_Ref"] ?? sampleRef?.["@_Ref"] ?? null;
  if (sampleRefAttr) return `sref:${String(sampleRefAttr)}`;

  // Fall back to clip name (sometimes used for audio loops)
  const name = clipNode?.Name?.[0]?.["@_Value"]?.[0] ?? clipNode?.Name?.[0];
  if (name) return String(name);

  // Fall back to file path fields
  const filePath =
    clipNode?.FileRef?.[0]?.Path?.[0] ??
    clipNode?.SampleName?.[0] ??
    null;
  if (filePath) return String(filePath);

  // Last resort: JSON stringify
  try {
    return `raw:${JSON.stringify(clipNode)}`;
  } catch {
    return "unknown";
  }
}