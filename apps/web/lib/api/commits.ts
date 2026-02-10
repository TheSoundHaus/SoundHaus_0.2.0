/**
 * Commits API
 * API calls for git commits and history
 * Note: These may call Gitea API directly since backend doesn't have commit endpoints yet
 */

import { apiClient } from './client';
import { ApiResponse } from '@/types/api';
import { Commit, CommitFile, Branch, Tag } from '@/types/commit';

// Gitea API base URL (usually same as backend but different path)
const GITEA_API_BASE = process.env.NEXT_PUBLIC_GITEA_URL || 'http://localhost:3000/api/v1';

export const commitsApi = {
  /**
   * Get commit history for a repository
   */
  async getCommits(
    owner: string,
    repo: string,
    options?: {
      sha?: string; // Branch/commit to start from
      path?: string; // Only commits that affect this path
      page?: number;
      limit?: number;
    }
  ): Promise<ApiResponse<Commit[]>> {
    const params = new URLSearchParams();
    if (options?.sha) params.append('sha', options.sha);
    if (options?.path) params.append('path', options.path);
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());

    const queryString = params.toString();
    const endpoint = `/repos/${owner}/${repo}/commits${queryString ? `?${queryString}` : ''}`;

    try {
      // Call Gitea API directly
      const response = await fetch(`${GITEA_API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch commits: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch commits',
      };
    }
  },

  /**
   * Get a single commit by SHA
   */
  async getCommit(
    owner: string,
    repo: string,
    sha: string
  ): Promise<ApiResponse<Commit & { files?: CommitFile[] }>> {
    const endpoint = `/repos/${owner}/${repo}/git/commits/${sha}`;

    try {
      // Call Gitea API directly
      const response = await fetch(`${GITEA_API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch commit: ${response.statusText}`,
        };
      }

      const data = await response.json();

      // Also fetch the commit's diff to get file changes
      const diffResponse = await fetch(
        `${GITEA_API_BASE}/repos/${owner}/${repo}/commits/${sha}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (diffResponse.ok) {
        const diffData = await diffResponse.json();
        return {
          success: true,
          data: {
            ...data,
            files: diffData.files,
          },
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch commit',
      };
    }
  },

  /**
   * Compare two commits or branches
   */
  async compareCommits(
    owner: string,
    repo: string,
    base: string,
    head: string
  ): Promise<ApiResponse<{ commits: Commit[]; files: CommitFile[] }>> {
    const endpoint = `/repos/${owner}/${repo}/compare/${base}...${head}`;

    try {
      const response = await fetch(`${GITEA_API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to compare commits: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: {
          commits: data.commits || [],
          files: data.files || [],
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to compare commits',
      };
    }
  },

  /**
   * Get branches for a repository
   */
  async getBranches(owner: string, repo: string): Promise<ApiResponse<Branch[]>> {
    const endpoint = `/repos/${owner}/${repo}/branches`;

    try {
      const response = await fetch(`${GITEA_API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch branches: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch branches',
      };
    }
  },

  /**
   * Get tags for a repository
   */
  async getTags(owner: string, repo: string): Promise<ApiResponse<Tag[]>> {
    const endpoint = `/repos/${owner}/${repo}/tags`;

    try {
      const response = await fetch(`${GITEA_API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch tags: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch tags',
      };
    }
  },
};
