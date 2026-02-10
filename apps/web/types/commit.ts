/**
 * Commit Types
 * Types for git commits and commit history
 */

export interface Commit {
  sha: string;
  commit: CommitDetail;
  author?: CommitUser;
  committer?: CommitUser;
  parents: CommitParent[];
  url?: string;
  html_url?: string;
  created?: string;
}

export interface CommitDetail {
  message: string;
  author: CommitAuthor;
  committer: CommitAuthor;
  tree: CommitTree;
  verification?: CommitVerification;
}

export interface CommitAuthor {
  name: string;
  email: string;
  date: string;
}

export interface CommitUser {
  id?: number;
  login?: string;
  full_name?: string;
  avatar_url?: string;
  email?: string;
}

export interface CommitParent {
  sha: string;
  url?: string;
}

export interface CommitTree {
  sha: string;
  url?: string;
}

export interface CommitVerification {
  verified: boolean;
  reason: string;
  signature?: string;
  payload?: string;
}

export interface CommitFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string; // Unified diff
  previous_filename?: string; // For renamed files
  blob_url?: string;
  raw_url?: string;
}

export interface CommitComparison {
  total_commits: number;
  ahead_by: number;
  behind_by: number;
  commits: Commit[];
  files: CommitFile[];
}

export interface Branch {
  name: string;
  commit: {
    sha: string;
    url?: string;
  };
  protected?: boolean;
}

export interface Tag {
  name: string;
  commit: {
    sha: string;
    url?: string;
  };
  zipball_url?: string;
  tarball_url?: string;
}
