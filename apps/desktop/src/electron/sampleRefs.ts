import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseAls } from 'semantic-differ';

/**
 * Ableton FileRef RelativePathType (ALS XML). See community docs / Live exports:
 * 0 Missing, 1 External, 2 Library (Core Library / Packs), 3 Current Project.
 */
export const ABLETON_RELATIVE_PATH_TYPE = {
    MISSING: 0,
    EXTERNAL: 1,
    /** Documented for older Live; still seen in some sets. */
    LIBRARY: 2,
    CURRENT_PROJECT: 3,
    /** Factory / Core Library / pack refs on many Live 12+ ALS exports (often 5 instead of 2). */
    LIBRARY_LIVE12: 5,
} as const;

function isAbletonLibraryRelativePathType(pathType: number | null | undefined): boolean {
    if (pathType === undefined || pathType === null) return false;
    return (
        pathType === ABLETON_RELATIVE_PATH_TYPE.LIBRARY ||
        pathType === ABLETON_RELATIVE_PATH_TYPE.LIBRARY_LIVE12
    );
}

export type MissingSampleIssue = {
    relativePath: string;
    reason: 'outside_project' | 'file_not_found';
};

/** Non-blocking: clip references Ableton library / pack audio (not copied into project). */
export type LibrarySampleAdvisory = {
    relativePath: string;
};

export type SampleRefsCheckResult = {
    hasIssues: boolean;
    issues: MissingSampleIssue[];
    libraryAdvisories: LibrarySampleAdvisory[];
};

/**
 * Thrown when pull/push is blocked until the user fixes or explicitly bypasses
 * missing / external sample references.
 */
export class SampleCheckBlockedError extends Error {
    readonly code = 'MISSING_SAMPLES' as const;

    constructor(public readonly issues: MissingSampleIssue[]) {
        const n = issues.length;
        const msg =
            n === 0
                ? 'Sample references need attention before syncing.'
                : n === 1
                  ? `An audio sample may be missing or outside the project: ${issues[0].relativePath}. In Ableton, use File → Collect All and Save, then save the set.`
                  : `${n} audio sample references look missing or outside the project folder. In Ableton, use File → Collect All and Save, then save the set.`;
        super(msg);
        this.name = 'SampleCheckBlockedError';
    }
}

export async function findRootAlsFile(repoPath: string): Promise<string | null> {
    const entries = await fs.promises.readdir(repoPath, { withFileTypes: true });
    const alsFile = entries.find((e) => e.isFile() && e.name.toLowerCase().endsWith('.als'));
    return alsFile ? path.join(repoPath, alsFile.name) : null;
}

function isInsideOrEqualDir(childAbs: string, rootAbs: string): boolean {
    const a = path.normalize(childAbs);
    const b = path.normalize(rootAbs);
    if (a.length < b.length) return false;
    if (a.toLowerCase() === b.toLowerCase()) return true;
    const sep = path.sep;
    return a.toLowerCase().startsWith(b.toLowerCase() + sep);
}

/**
 * Normalize paths from Ableton SampleRef (may be file: URLs, percent-encoded, ./-prefixed).
 */
function normalizeAbletonSamplePath(raw: string): string {
    let s = raw.trim();
    if (!s) return s;
    if (/^file:\/\//i.test(s)) {
        try {
            s = fileURLToPath(s);
        } catch {
            /* keep s */
        }
    }
    try {
        s = decodeURIComponent(s);
    } catch {
        /* keep s */
    }
    const isWinAbs = /^[A-Za-z]:[\\/]/.test(s);
    if (!path.isAbsolute(s) && !isWinAbs) {
        s = s.replace(/^(\.[\\/])+/, '').replace(/^[/\\]+/, '');
    }
    return s;
}

/**
 * Heuristic: flag sample refs that point outside the repo or to files that are not on disk.
 * Ableton library refs (RelativePathType 2 or 5 on newer Live) are advisory only — do not block sync.
 */
export async function checkMissingSampleRefs(
    repoPath: string,
    alsPath: string,
): Promise<SampleRefsCheckResult> {
    const repoRoot = path.resolve(repoPath);
    const issues: MissingSampleIssue[] = [];
    const libraryAdvisories: LibrarySampleAdvisory[] = [];
    const seen = new Set<string>();
    const seenLibrary = new Set<string>();

    let project: { tracks?: Array<{ clips?: unknown[] }> };
    try {
        const json = await parseAls(alsPath);
        project = JSON.parse(json) as { tracks?: Array<{ clips?: unknown[] }> };
    } catch {
        return { hasIssues: false, issues: [], libraryAdvisories: [] };
    }

    const record = (rel: string, reason: MissingSampleIssue['reason']) => {
        if (!seen.has(rel)) {
            seen.add(rel);
            issues.push({ relativePath: rel, reason });
        }
    };

    const recordLibrary = (rel: string) => {
        if (!seenLibrary.has(rel)) {
            seenLibrary.add(rel);
            libraryAdvisories.push({ relativePath: rel });
        }
    };

    const visitClip = (clip: {
        sample_ref?: {
            relative_path?: string;
            relative_path_type?: number | null;
            name?: string;
        };
    }) => {
        const sr = clip?.sample_ref;
        if (!sr) return;

        const relRaw = typeof sr.relative_path === 'string' ? sr.relative_path.trim() : '';
        const pathType = sr.relative_path_type;
        if (isAbletonLibraryRelativePathType(pathType)) {
            const label =
                relRaw || (typeof sr.name === 'string' ? sr.name.trim() : '') || '';
            if (label) recordLibrary(label);
            return;
        }

        if (!relRaw) return;

        const rel = normalizeAbletonSamplePath(relRaw);
        if (!rel) return;

        if (path.isAbsolute(rel) || /^[A-Za-z]:[\\/]/.test(rel)) {
            const resolved = path.normalize(rel);
            if (!isInsideOrEqualDir(resolved, repoRoot)) {
                record(relRaw, 'outside_project');
            } else if (!fs.existsSync(resolved)) {
                record(relRaw, 'file_not_found');
            }
            return;
        }

        const fromRoot = path.normalize(path.resolve(path.join(repoRoot, rel)));
        const fromAls = path.normalize(path.resolve(path.join(path.dirname(alsPath), rel)));
        const existsRoot = fs.existsSync(fromRoot);
        const existsAls = fs.existsSync(fromAls);
        if (!existsRoot && !existsAls) {
            record(relRaw, 'file_not_found');
            return;
        }
        const chosen = existsRoot ? fromRoot : fromAls;
        if (!isInsideOrEqualDir(chosen, repoRoot)) {
            record(relRaw, 'outside_project');
        }
    };

    for (const track of project.tracks || []) {
        for (const clip of track.clips || []) {
            if (clip && typeof clip === 'object') {
                visitClip(
                    clip as {
                        sample_ref?: {
                            relative_path?: string;
                            relative_path_type?: number | null;
                            name?: string;
                        };
                    },
                );
            }
        }
    }

    return { hasIssues: issues.length > 0, issues, libraryAdvisories };
}
