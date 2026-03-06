# Desktop App — Pipeline Architecture Notes

A reference document for rearchitecting the git, diff, and UI data flows. Written March 3, 2026.

---

## Table of Contents

1. [Git Binaries — Locations and Resolution Logic](#1-git-binaries--locations-and-resolution-logic)
2. [Temporary Files — Lifecycle and Purpose](#2-temporary-files--lifecycle-and-purpose)
3. [Rust Module — Structure and Exports](#3-rust-module--structure-and-exports)
4. [Rust Module — Call Sites and Purpose](#4-rust-module--call-sites-and-purpose)
5. [ProjectPage Data Flow — Changes Tab and Track Info](#5-projectpage-data-flow--changes-tab-and-track-info)

---

## 1. Git Binaries — Locations and Resolution Logic

### Where `gitBin` is defined

**File:** [`src/electron/project.ts` (lines 20–38)](src/electron/project.ts#L20)

```typescript
const platformMap: Partial<Record<NodeJS.Platform, string>> = {
  win32: 'windows',
  darwin: 'macos',
  linux: 'linux',
};

const platformDir = platformMap[process.platform] || process.platform;
const envGit = process.env.SOUNDHAUS_GIT_BIN;
let gitBin = envGit
  || path.join(__dirname, '..', 'vendor', 'git', platformDir,
               process.platform === 'win32' ? 'git.exe' : 'git');

try {
  if (gitBin !== 'git' && !fs.existsSync(gitBin)) {
    console.warn('Configured git binary not found — falling back to system git');
    gitBin = 'git';
  }
} catch (e) {
  gitBin = 'git';
}
```

**Priority order:**
1. `SOUNDHAUS_GIT_BIN` environment variable (override for CI / dev)
2. Bundled binary at `vendor/git/<platform>/git[.exe]` — packed into the Electron app bundle
3. System `git` in `PATH` (silent fallback if the bundled binary file is missing)

`gitBin` is exported from `project.ts` and imported in `main.ts`.

### Where `gitBin` is used

| Location | File | Operation |
|---|---|---|
| `getAlsFromGitHead()` | [`project.ts`](src/electron/project.ts#L58) | `git show HEAD:<relPath>` — extract committed ALS bytes |
| `pull()` | [`project.ts`](src/electron/project.ts#L317) | `git pull origin main` |
| `commit()` | [`project.ts`](src/electron/project.ts#L331) | `git add . && git commit -m "..."` |
| `push()` | [`project.ts`](src/electron/project.ts#L348) | `git push origin HEAD` |
| `commit-changes` handler | [`main.ts`](src/electron/main.ts#L159) | `git rev-parse --verify HEAD` (first-commit check) |
| `get-remote-head-als` handler | [`main.ts`](src/electron/main.ts#L238) | `git rev-parse --show-toplevel` and `git rev-parse --verify HEAD` |

### Limitations

- **`pull()`, `commit()`, `push()` use `exec()` with string interpolation** — the binary path and commit message are interpolated into a shell string. Double-quotes in the message are escaped, but the full path to `gitBin` must not contain spaces for this to be safe. `execFile()` (no shell) would be more robust.
- **The `fs.existsSync` fallback check happens at module load time.** If the vendor binary is added after the module is first required (e.g., during a post-install script), the fallback to system `git` persists for the entire process lifetime.
- **No version check.** The bundled git version is never verified; a corrupt or outdated binary will silently downgrade to system git or fail at runtime.

### Suggested improvement

Replace all `exec(cmd, ...)` string-interpolation calls in `pull`, `commit`, `push` with `execFile(gitBin, [...args], {cwd: repoPath})`. This removes any shell dependency and makes path-with-spaces safe. Consider adding a `checkGitBinary()` async helper that runs `git --version` at startup and logs the resolved binary path, so failures are caught early rather than at the first user operation.

---

## 2. Temporary Files — Lifecycle and Purpose

Two distinct temporary files are created at different points in the pipeline. Neither is managed by a central registry.

---

### 2a. `.remote-head.tmp` — Changes Tab diff baseline

**Created by:** `get-remote-head-als` IPC handler
**File:** [`main.ts` (line ~254)](src/electron/main.ts#L250)

```typescript
const tmpPath = path.join(
  path.dirname(alsPath),
  `.${path.basename(alsPath)}.remote-head.tmp`   // e.g. .MyProject.als.remote-head.tmp
);
await fs.promises.writeFile(tmpPath, head.buffer);  // head.buffer = decompressed XML
return { ok: true, tmpPath };
```

**Contents:** The raw decompressed XML of the HEAD-committed `.als` file (not gzip). The Rust `parse_als_file()` handles this correctly because `streaming_reader_from_path()` auto-detects plain XML by the absence of gzip magic bytes.

**Deleted by:** The `diff-xml` IPC handler, after `parseXml()` returns:
```typescript
await fs.promises.unlink(oldAlsPath).catch(() => {});
```
**File:** [`main.ts`](src/electron/main.ts#L222)

**Leak risk:** If `diff-xml` throws before reaching the unlink, or if the renderer never calls `diff-xml` after receiving `tmpPath` (e.g. network timeout, app crash), the file is left on disk next to the `.als` file indefinitely.

---

### 2b. `.commit-diff.tmp` — Semantic commit message generation

**Created by:** `commit-changes` IPC handler
**File:** [`main.ts`](src/electron/main.ts#L168)

```typescript
const tmpPath = path.join(repoPath, `.${alsFile.name}.commit-diff.tmp`);
await fs.promises.writeFile(tmpPath, head.buffer);  // head.buffer = decompressed XML
```

**Contents:** Same as above — decompressed XML of HEAD, used as the "before" input so the diff engine can describe what changed relative to HEAD before `git add` stages the new file.

**Deleted by:** A `finally` block wrapping only the `parseXml()` call:
```typescript
try {
  const rawJson = parseXml(alsPath, tmpPath);
  ...
} finally {
  await fs.promises.unlink(tmpPath).catch(() => {});
}
```
**File:** [`main.ts`](src/electron/main.ts#L174)

**Leak risk:** Lower — the `finally` block catches most code paths, but an unhandled rejection in `getAlsFromGitHead()` (before `tmpPath` is written) could still theoretically leave a file if one was written from a previous partial run.

---

### Limitations

- **Both temp files are written to the project directory** — they appear alongside the user's `.als` file and could confuse Ableton or version control. This is especially problematic because the directory is also the git repo root; `git add .` in `commit()` could theoretically stage a stale `.tmp` file if cleanup fails and a commit is triggered before the next `diff-xml` call.
- **Neither temp file has a timeout-based cleanup.** If the app is force-quit between `get-remote-head-als` and `diff-xml`, `.remote-head.tmp` is orphaned permanently.
- **Two separate temp files serve the same purpose** (HEAD XML baseline) but are created independently in two different handlers. Decompressed XML is written to disk for the sole reason that `parseXml()` only accepts file paths, not buffers.

### Suggested improvement

Use `parse_xml_from_buffer()` — the Rust module already exports this function (see [Section 3](#3-rust-module--structure-and-exports)). This function accepts two `Buffer` arguments and eliminates the need to write any temp file at all. Neither `.remote-head.tmp` nor `.commit-diff.tmp` would be needed:

```typescript
// Instead of writeFile + parseXml(path, tmpPath):
import { parseXmlFromBuffer } from '../../native/semantic-diff/index.js'

const head = await getAlsFromGitHead(repoRoot, relPath);
const current = await fs.promises.readFile(alsPath);
const rawJson = parseXmlFromBuffer(current, head.buffer);
```

`head.buffer` is already decompressed XML; `current` is gzip — both formats are handled by `streaming_reader_from_buffer()` in the Rust module.

---

## 3. Rust Module — Structure and Exports

**Location:** [`native/semantic-diff/`](native/semantic-diff/)
**Build output:** `native/semantic-diff/parser.darwin-arm64.node` (NAPI-RS native addon, ~786KB)
**Type declarations:** [`native/semantic-diff/index.d.ts`](native/semantic-diff/index.d.ts)

### Source modules

| File | Role |
|---|---|
| [`src/lib.rs`](native/semantic-diff/src/lib.rs) | NAPI entry point — declares the 3 exported functions |
| [`src/parser.rs`](native/semantic-diff/src/parser.rs) | Recursive-descent XML parser (~850 lines) |
| [`src/diff.rs`](native/semantic-diff/src/diff.rs) | Semantic diff engine — Levenshtein, CRC identity, instrument swap |
| [`src/models.rs`](native/semantic-diff/src/models.rs) | All structs: `Project`, `Track`, `Device`, `Branch`, `DiffReport`, `ChangeNode`, etc. |
| [`src/utils.rs`](native/semantic-diff/src/utils.rs) | Streaming decompression helpers, attribute extraction, `name_similarity()` |

### Exported functions

**`parseXml(currentFilepath: string, oldAlsPath: string): string`**
- Declared at [`lib.rs` line 21](native/semantic-diff/src/lib.rs#L21)
- Reads both files from disk using `streaming_reader_from_path()` (auto-detects gzip vs plain XML by magic bytes `0x1f 0x8b`)
- Parses each into a `Project` struct, runs `diff_projects()`, returns a JSON `DiffReport`

**`parseXmlFromBuffer(currentBuf: Buffer, oldBuf: Buffer): string`**
- Declared at [`lib.rs` line 41](native/semantic-diff/src/lib.rs#L41)
- Same as above but accepts Node.js `Buffer` objects in-memory — no disk I/O
- Uses `streaming_reader_from_buffer()` — also handles both gzip and plain XML

**`parseAls(filepath: string): string`**
- Declared at [`lib.rs` line 58](native/semantic-diff/src/lib.rs#L58)
- Parses a single file and returns the `Project` JSON with no diff (track listing only)
- Currently unused in the active call graph

### DiffReport output shape

```typescript
interface DiffReport {
  stats: { added: number; removed: number; renamed: number; modified: number; moved: number };
  changes: ChangeNode[];   // top-level changes, typically one per track
  project: Project;        // full parsed state of the CURRENT file
}

interface ChangeNode {
  change_type: string;
  id?: string;
  label: string;
  action: 'added' | 'removed' | 'renamed' | 'likely_rename' | 'moved' | 'modified' | 'instrument_swap' | 'value_change';
  context?: string;
  from?: string;
  to?: string;
  confidence?: number;     // 0.0–1.0 (Levenshtein similarity, for renames)
  children: ChangeNode[];  // nested changes within a track
}
```

### Limitations

- **The compiled binary is platform-specific** — `parser.darwin-arm64.node` only works on macOS ARM64. Building for other targets (Intel macOS, Windows, Linux) requires running `napi build --release --platform` on each target, or using cross-compilation in CI. The `index.js` NAPI loader generated by NAPI-RS handles platform selection at runtime, but only if the corresponding `.node` file exists.
- **No incremental parsing.** Every diff call re-parses both ALS files from scratch. For large projects (100+ tracks, many devices), this is measurable latency.
- **`parseAls` (single-file) is unused** — the Track Information panel currently gets its data indirectly from the `project` field of `DiffReport`, which requires a diff call. `parseAls` could power that panel independently.

### Suggested improvement

Wire `parseAls` into a dedicated `parse-als` IPC handler and call it on page load to populate the Track Information panel immediately, without waiting for the two-step `get-remote-head-als` + `diff-xml` chain. The Changes tab refresh and the track listing would then be fully decoupled.

---

## 4. Rust Module — Call Sites and Purpose

### Call site 1: `diff-xml` IPC handler

**File:** [`main.ts` (line 191)](src/electron/main.ts#L191)
**Function used:** `parseXml(curAlsPath, oldAlsPath)`
**Purpose:** Compare the current working `.als` file against the HEAD-committed version to populate the Changes tab.
**Triggered by:** The renderer calling `electronAPI.diffXml(alsPath, tmpPath)` after `get-remote-head-als` has written `tmpPath`.
**Input:** 
- `curAlsPath` — absolute path to the live `.als` file (gzip-compressed)
- `oldAlsPath` — absolute path to `.remote-head.tmp` (decompressed XML, written by `get-remote-head-als`)

**Output:**  The handler wraps the raw `DiffReport` JSON and adapts it for the existing UI:
```typescript
return {
  summary: summaryLines.join('\n'),        // flat text for the Changes panel
  diffStatus: 'has-changes' | 'in-sync',  // drives UI conditional
  project: { Tracks: legacyTracks },       // drives the Track Information panel
  report,                                  // full DiffReport for future use
};
```

---

### Call site 2: `commit-changes` IPC handler

**File:** [`main.ts` (line 146)](src/electron/main.ts#L146)
**Function used:** `parseXml(alsPath, tmpPath)`
**Purpose:** Generate a semantic, human-readable git commit message that describes what changed relative to HEAD, *before* staging and committing.
**Triggered by:** The renderer calling `gitService.commitChange(repoPath)` (the "Save Changes in Snapshot" button).
**Input:**
- `alsPath` — the current working `.als`
- `tmpPath` (`.commit-diff.tmp`) — the HEAD version written ephemerally for this call only

**Output:** A commit message string passed to `commit(repoPath, message)`. Examples:
- `"Add Synth Lead"` (one new track)
- `"Swap instrument on Bass (Operator → Wavetable)"` (instrument replaced)
- `"Update project: 2 tracks added, 1 modified"` (>3 changes, stat summary)
- `"Initial snapshot: MyProject"` (no HEAD exists — first commit, no diff run)

---

### Limitations

- **Both call sites use `parseXml()` (file-path version)** despite the buffer version being available and eliminating all temp file overhead. See [Section 2 — Suggested improvement](#suggested-improvement-1).
- **`diff-xml` is a two-IPC-call chain.** The renderer must first call `get-remote-head-als`, wait for the tmp file to be written, then call `diff-xml`. A network hiccup, slow disk, or race condition between the two calls can leave the tmp file orphaned. A single IPC call that accepts the ALS path and returns the full diff (using `parseXmlFromBuffer` internally) would remove this two-step dependency entirely.
- **The `parse_xml` Rust function is called synchronously on the Node.js main thread** via NAPI. For large project files this blocks the IPC dispatch loop. NAPI-RS supports async Rust tasks (`#[napi(ts_return_type = "Promise<string>")]`) which would keep the main thread responsive.

### Suggested improvement

Consolidate the two-step `get-remote-head-als` + `diff-xml` IPC sequence into a single `get-changes` handler that:
1. Resolves the repo root and HEAD in one shot using `gitBin`
2. Reads the HEAD blob via `getAlsFromGitHead()` (already returns a `Buffer`)
3. Reads the current `.als` file into a `Buffer`
4. Calls `parseXmlFromBuffer(currentBuf, headBuf)` synchronously (no temp files)
5. Returns the adapted `DiffReport` directly

This would be one IPC roundtrip instead of two, zero temp files, and no orphan risk.

---

## 5. ProjectPage Data Flow — Changes Tab and Track Info

**File:** [`src/pages/ProjectPage.tsx`](src/pages/ProjectPage.tsx)

### State

```typescript
const [alsStruct, setAlsStruct] = useState<any | null>(null)
const [selectedProject, setSelectedProject] = useState<string | null>(initialPath)
const [refreshing, setRefreshing] = useState(false)
```

`alsStruct` is the single shared state object that drives both the Changes tab and the Track Information panel. It takes one of several shapes depending on the outcome of `handleRefreshChanges`:

| `alsStruct` shape | Meaning |
|---|---|
| `null` | Not yet loaded (initial render) |
| `{ ok: false, reason: string }` | An error occurred at any step |
| `{ ok: true, baselineStatus: 'no-commits', summary, project }` | Repo has no commits yet; fallback parse from `buildLocalDiffFromAls` |
| `{ diffStatus: 'has-changes', summary, project, report }` | Diff ran and found changes |
| `{ diffStatus: 'in-sync', summary: '', project, report }` | Diff ran and found no changes |

---

### `handleRefreshChanges` — step-by-step

**File:** [`ProjectPage.tsx` (line 27)](src/pages/ProjectPage.tsx#L27)

```
handleRefreshChanges()
   │
   ├─ findAndParse(selectedProject)            ← useAlsParser: background track listing (ignored by Changes tab)
   │
   ├─ findAls(selectedProject)                 ← IPC 'find-als' → first .als file in folder
   │      returns: /abs/path/MyProject.als
   │
   ├─ electronAPI.getRemoteHeadAls(alsPath)    ← IPC 'get-remote-head-als'
   │      ├─ git rev-parse --show-toplevel     ← resolves repo root
   │      ├─ git rev-parse --verify HEAD       ← checks for at least one commit
   │      │    on failure → buildLocalDiffFromAls(alsPath)
   │      │                 returns { ok: true, baselineStatus: 'no-commits', summary, project }
   │      ├─ getAlsFromGitHead(root, relPath)  ← git show HEAD:<relPath>, decompresses if gzip
   │      └─ fs.writeFile(tmpPath, head.buffer) ← writes .remote-head.tmp (decompressed XML)
   │          returns { ok: true, tmpPath }
   │
   └─ electronAPI.diffXml(alsPath, tmpPath)    ← IPC 'diff-xml'
          ├─ parseXml(alsPath, tmpPath)        ← Rust: recursive parse + semantic diff
          ├─ build summaryLines[]              ← flat text lines for the panel
          ├─ map legacyTracks[]                ← for Track Information panel
          ├─ fs.unlink(tmpPath)                ← cleanup .remote-head.tmp
          └─ return { summary, diffStatus, project: { Tracks }, report }
```

---

### Changes Tab rendering

**File:** [`ProjectPage.tsx` (line ~200)](src/pages/ProjectPage.tsx#L200)

The Changes panel renders based on `alsStruct` as follows:

```
alsStruct === null
  → "No ALS loaded"

alsStruct.ok === false
  → alsStruct.reason ?? 'An error occurred'

alsStruct.baselineStatus === 'no-commits'
  → "No snapshots yet — this will be the initial snapshot."

alsStruct.diffStatus === 'in-sync'
  → "✓ In sync with last snapshot"

alsStruct.diffStatus === 'has-changes'
  → alsStruct.summary.split('\n').map(line => <div>{line}</div>)

(fallthrough)
  → "Press ↻ to compare with last snapshot"
```

The ↻ refresh button is embedded in the section header. It calls `handleRefreshChanges()` and `e.stopPropagation()` to prevent the accordion from toggling.

---

### Track Information panel rendering

**File:** [`ProjectPage.tsx` (line ~155)](src/pages/ProjectPage.tsx#L155)

Renders `alsStruct.project.Tracks[]`, where each track has the legacy shape:
```typescript
{ Type: string, Id: string, EffectiveName: string, UserName: string | null }
```
This data comes from the `legacyTracks` mapping inside the `diff-xml` handler in `main.ts` — meaning **the Track Information panel only shows data after a full diff completes**. There is no independent track-listing call.

---

### Git action buttons

| Button | Handler | IPC call | Post-action |
|---|---|---|---|
| Download Changes from Server | `handleGitPull` | `gitService.pullRepo(repoPath)` → `pull-repo` | Calls `handleRefreshChanges()` to show updated diff |
| Save Changes in Snapshot | `handleGitCommit` | `gitService.commitChange(repoPath)` → `commit-changes` | Sets `alsStruct` to `{ ...prev, diffStatus: 'in-sync', summary: '' }` locally (no IPC roundtrip) |
| Upload Changes to Server | `handleGitPush` | `gitService.pushRepo(repoPath)` → `push-repo` | Calls `handleRefreshChanges()` |

---

### Limitations

- **`alsStruct` conflates two concerns** — the Track Information panel and the Changes tab share a single state object. A failure in the diff step wipes out track data, and vice versa. They should have separate state.
- **Track Information only populates after a full diff.** `parseAls` (single-file, no diff) exists in the Rust module and would be faster and simpler for this purpose, but it is currently unused.
- **`useAlsParser` / `findAndParse` is called at the top of `handleRefreshChanges`** but its result (`metadata`) is never used by `ProjectPage` — the data is stored in the hook's internal state and not consumed. It runs a full `get-als-content` IPC call on every refresh for no visible effect.
- **`getAlsStruct` is imported from `useElectronIPC`** but never called — it still points to the deprecated `find-instrument-changes` IPC channel (which has no handler), via `preload.ts`. A call to it would silently return `undefined`.
- **`selectedProject` setter (`setSelectedProject`) is destructured but never called** — the project path is fixed from `location.state` at mount and cannot be changed without navigating away.
- **No loading indicator during the two-step diff chain.** `refreshing` is set to `true`, but the UI only shows a spinning `⟳` on the refresh button; the panel itself shows stale data (or `null`) during the load.

### Suggested improvement

Split `alsStruct` into two independent pieces of state:
- `trackList: Track[] | null` — populated by a single `parse-als` IPC call on mount
- `diffResult: DiffResult | null` — populated only when the user explicitly refreshes or after a pull

Wire `parseAls()` into a `parse-als` IPC handler and use it to populate the Track Information panel on mount independently of the Changes tab. Consolidate `get-remote-head-als` + `diff-xml` into a single `get-changes` IPC call (see [Section 4 — Suggested improvement](#suggested-improvement-2)) so the Changes tab has one atomic operation with clear loading/error/success states.
