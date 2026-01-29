export interface ElectronAPI {
  chooseFolder: () => Promise<string | null>
  hasGitFile: (folderPath: string) => Promise<boolean>
  getAlsStruct: (alsPath: string) => Promise<any>
  findAls: (folderPath: string) => Promise<string | null>
  getAlsContent: (alsPath: string) => Promise<any>
}

export interface GitService {
  initRepo: (folderPath: string, projectInfo?: ProjectSetupData) => Promise<string>
  pullRepo: (repoPath: string) => Promise<string>
  commitChange: (repoPath: string) => Promise<string>
  pushRepo: (repoPath: string) => Promise<string>
  getSoundHausCredentials: () => Promise<string | null>
  setSoundHausCredentials: (token: string) => Promise<string>
}

// ALS (Ableton Live Set) types
export interface AlsMetadata {
  version?: string
  creator?: string
  tempo?: number
  tracks?: {
    midi: number
    audio: number
    return: number
  }
  samples?: Array<{
    path: string
    count: number
  }>
}

export interface DecompressedAls {
  buffer: Buffer,
  text: string,
  hash: string
}

export interface AlsCompareOptions {
  allowTrackNameFallback?: boolean;
}

export interface AlsDeviceHint {
  name?: string | null;
  trackHint?: string | null;
}

export interface AlsChange {
  trackId: string | number | null;
  trackName: string;
  beforeTrackName: string | null;
  afterTrackName: string | null;
  before: AlsDeviceHint;
  after: AlsDeviceHint;
}

export type StructuralCompareResult =
  | { ok: true; changes: AlsChange[] }
  | { ok: false; reason: string }

type TrackEntryBase = {
  id: string | number | null;
  name: string;
  node: any;
};

export type AudioTrackEntry = TrackEntryBase & {
  type: 'Audio';
  typeIndex: number;
};

export type MidiTrackEntry = TrackEntryBase & {
  type: 'MIDI';
  typeIndex: number;
};

export type AnyTrackEntry = AudioTrackEntry | MidiTrackEntry;

export type MainInstrumentInfo = {
  deviceType: string | null;
  preset: string | null;
  name: string | null;
  path: string | null;
};

export interface ProjectSetupData {
  name: string;
  description: string;
  isPublic: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
    gitService?: GitService
  }
}