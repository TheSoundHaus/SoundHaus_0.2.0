import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/** Serializable time-travel return point (matches in-memory shape in main process). */
export type TimeTravelState = {
  returnBranch: string;
  returnSha: string;
  stashMessages: string[];
};

const FILE_VERSION = 1 as const;

type PersistedFile = {
  version: typeof FILE_VERSION;
  entries: Record<string, TimeTravelState>;
};

function storePath(): string {
  return path.join(app.getPath('userData'), 'soundhaus-time-travel.json');
}

async function readStore(): Promise<PersistedFile> {
  try {
    const raw = await fs.promises.readFile(storePath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as PersistedFile).version === FILE_VERSION &&
      typeof (parsed as PersistedFile).entries === 'object' &&
      (parsed as PersistedFile).entries !== null &&
      !Array.isArray((parsed as PersistedFile).entries)
    ) {
      return parsed as PersistedFile;
    }
  } catch {
    /* missing or corrupt */
  }
  return { version: FILE_VERSION, entries: {} };
}

async function writeStore(data: PersistedFile): Promise<void> {
  const p = storePath();
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(data), 'utf8');
  await fs.promises.rename(tmp, p);
}

/**
 * Load persisted time-travel metadata for a repo key (resolved absolute path).
 */
export async function loadPersistedTimeTravel(
  key: string,
): Promise<TimeTravelState | undefined> {
  const file = await readStore();
  const entry = file.entries[key];
  if (!entry) return undefined;
  if (
    typeof entry.returnBranch !== 'string' ||
    typeof entry.returnSha !== 'string' ||
    !Array.isArray(entry.stashMessages)
  ) {
    return undefined;
  }
  return {
    returnBranch: entry.returnBranch,
    returnSha: entry.returnSha,
    stashMessages: entry.stashMessages.filter((m) => typeof m === 'string'),
  };
}

export async function savePersistedTimeTravel(
  key: string,
  state: TimeTravelState,
): Promise<void> {
  const file = await readStore();
  file.entries[key] = {
    returnBranch: state.returnBranch,
    returnSha: state.returnSha,
    stashMessages: [...state.stashMessages],
  };
  await writeStore(file);
}

export async function removePersistedTimeTravel(key: string): Promise<void> {
  const file = await readStore();
  if (!(key in file.entries)) {
    return;
  }
  delete file.entries[key];
  await writeStore(file);
}
