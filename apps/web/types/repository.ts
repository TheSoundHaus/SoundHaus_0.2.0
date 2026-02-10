/**
 * Repository Types
 * Types for repositories, files, and contents
 */

export interface Repository {
  id: number;
  owner: RepositoryOwner;
  name: string;
  full_name: string;
  description?: string;
  private: boolean;
  empty: boolean;
  size: number;
  html_url: string;
  clone_url: string;
  ssh_url?: string;
  default_branch: string;
  created_at: string;
  updated_at: string;
  stars_count?: number;
  forks_count?: number;
  watchers_count?: number;
  open_issues_count?: number;
  language?: string;
  topics?: string[];
}

export interface RepositoryOwner {
  id: number;
  login: string;
  full_name?: string;
  avatar_url?: string;
  email?: string;
}

export interface FileContent {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  size: number;
  sha: string;
  url?: string;
  html_url?: string;
  git_url?: string;
  download_url?: string;
  content?: string; // base64 encoded for files
  encoding?: string;
  lfs?: boolean; // Custom field added by backend
  target?: string; // For symlinks
  submodule_git_url?: string; // For submodules
}

export interface FileTreeNode extends FileContent {
  children?: FileTreeNode[];
  expanded?: boolean;
}

export interface RepositoryStats {
  stars: number;
  forks: number;
  tracks: number; // Audio files count
  collaborators: number;
  commits: number;
  size: number; // in bytes
}

export interface RepositoryPreferences {
  visibility?: 'public' | 'private';
  default_branch?: string;
  description?: string;
  topics?: string[];
  allow_merge_commits?: boolean;
  allow_rebase?: boolean;
  allow_squash_merge?: boolean;
}

export type FileType =
  | 'audio'
  | 'video'
  | 'image'
  | 'text'
  | 'code'
  | 'markdown'
  | 'json'
  | 'xml'
  | 'pdf'
  | 'archive'
  | 'ableton'
  | 'binary'
  | 'unknown';

export interface ParsedAbletonProject {
  version?: string;
  tempo?: number;
  timeSignature?: string;
  key?: string;
  tracks: AbletonTrack[];
  devices: string[];
}

export interface AbletonTrack {
  name: string;
  type: 'audio' | 'midi' | 'return' | 'master';
  color?: string;
  muted?: boolean;
  solo?: boolean;
}
