/**
 * User Types
 * Types for user profiles and authentication
 */

export interface User {
  id: string;
  email: string;
  username?: string;
  user_metadata?: UserMetadata;
  created_at?: string;
  updated_at?: string;
}

export interface UserMetadata {
  name?: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  location?: string;
  website?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  name?: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  location?: string;
  website?: string;
  created_at: string;
  public_repos_count?: number;
  total_commits?: number;
  collaborations_count?: number;
}

export interface UserStats {
  repositories: number;
  commits: number;
  collaborations: number;
  stars?: number;
}

export interface Collaborator {
  id: number;
  login: string;
  full_name?: string;
  avatar_url?: string;
  permission?: 'read' | 'write' | 'admin';
}

export interface Invitation {
  id: string;
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
      avatar_url?: string;
    };
  };
  inviter: {
    login: string;
    avatar_url?: string;
  };
  created_at: string;
}
