/**
 * Repository API
 * API calls for repository operations
 */

import { apiClient } from './client';
import { ApiResponse } from '@/types/api';
import {
  Repository,
  FileContent,
  RepositoryStats,
  RepositoryPreferences,
} from '@/types/repository';
import { Collaborator, Invitation } from '@/types/user';

export const repositoryApi = {
  /**
   * Get all repositories for the authenticated user
   */
  async getRepositories(): Promise<ApiResponse<Repository[]>> {
    const response = await apiClient.get<{ repos: Repository[] }>('/repos');
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.repos,
      };
    }
    return response as ApiResponse<Repository[]>;
  },

  /**
   * Get a single repository by name
   */
  async getRepository(repoName: string): Promise<ApiResponse<Repository>> {
    return apiClient.get<Repository>(`/repos/${repoName}`);
  },

  /**
   * Create a new repository
   */
  async createRepository(data: {
    name: string;
    description?: string;
    private?: boolean;
  }): Promise<ApiResponse<Repository>> {
    return apiClient.post<Repository>('/repos', data);
  },

  /**
   * Get repository file/folder contents at a specific path
   */
  async getContents(
    repoName: string,
    path: string = ''
  ): Promise<ApiResponse<FileContent[]>> {
    const endpoint = path
      ? `/repos/${repoName}/contents?path=${encodeURIComponent(path)}`
      : `/repos/${repoName}/contents`;

    const response = await apiClient.get<{ contents: FileContent[] }>(endpoint);
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.contents,
      };
    }
    return response as ApiResponse<FileContent[]>;
  },

  /**
   * Get file content (decoded)
   */
  async getFileContent(repoName: string, path: string): Promise<ApiResponse<string>> {
    const response = await this.getContents(repoName, path);
    if (!response.success || !response.data) {
      return response as ApiResponse<string>;
    }

    // Should be single file
    const file = response.data[0];
    if (!file || file.type !== 'file') {
      return {
        success: false,
        error: 'Path is not a file',
      };
    }

    // If content is base64 encoded, decode it
    if (file.content && file.encoding === 'base64') {
      try {
        const decoded = atob(file.content);
        return {
          success: true,
          data: decoded,
        };
      } catch (error) {
        return {
          success: false,
          error: 'Failed to decode file content',
        };
      }
    }

    // Otherwise fetch from download_url
    if (file.download_url) {
      try {
        const response = await fetch(file.download_url);
        const text = await response.text();
        return {
          success: true,
          data: text,
        };
      } catch (error) {
        return {
          success: false,
          error: 'Failed to fetch file content',
        };
      }
    }

    return {
      success: false,
      error: 'No content or download URL available',
    };
  },

  /**
   * Upload a file to repository
   */
  async uploadFile(
    repoName: string,
    data: {
      path: string;
      content: Blob | File;
      message?: string;
    }
  ): Promise<ApiResponse<FileContent>> {
    const formData = new FormData();
    formData.append('file', data.content);
    if (data.message) {
      formData.append('message', data.message);
    }

    return apiClient.post<FileContent>(`/repos/${repoName}/upload?path=${encodeURIComponent(data.path)}`, formData, {
      headers: {
        // Don't set Content-Type, let browser set it with boundary
      },
    } as RequestInit);
  },

  /**
   * Delete a file from repository
   */
  async deleteFile(repoName: string, path: string): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete<{ message: string }>(
      `/repos/${repoName}/contents?path=${encodeURIComponent(path)}`
    );
  },

  /**
   * Get repository preferences
   */
  async getPreferences(repoName: string): Promise<ApiResponse<RepositoryPreferences>> {
    const response = await apiClient.get<{ preferences: RepositoryPreferences }>(
      `/repos/${repoName}/preferences`
    );
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.preferences,
      };
    }
    return response as ApiResponse<RepositoryPreferences>;
  },

  /**
   * Update repository preferences
   */
  async updatePreferences(
    repoName: string,
    preferences: Partial<RepositoryPreferences>
  ): Promise<ApiResponse<RepositoryPreferences>> {
    const response = await apiClient.post<{ preferences: RepositoryPreferences }>(
      `/repos/${repoName}/preferences`,
      preferences
    );
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.preferences,
      };
    }
    return response as ApiResponse<RepositoryPreferences>;
  },

  /**
   * Get repository collaborators
   */
  async getCollaborators(repoName: string): Promise<ApiResponse<Collaborator[]>> {
    const response = await apiClient.get<{ collaborators: Collaborator[] }>(
      `/repos/${repoName}/collaborators`
    );
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.collaborators,
      };
    }
    return response as ApiResponse<Collaborator[]>;
  },

  /**
   * Invite a collaborator to repository
   */
  async inviteCollaborator(
    repoName: string,
    username: string
  ): Promise<ApiResponse<{ invitation_id: string }>> {
    return apiClient.post<{ invitation_id: string }>(
      `/repos/${repoName}/collaborators/invite`,
      { username }
    );
  },

  /**
   * Remove a collaborator from repository
   */
  async removeCollaborator(
    repoName: string,
    username: string
  ): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete<{ message: string }>(
      `/repos/${repoName}/collaborators/${username}`
    );
  },

  /**
   * Delete a repository
   */
  async deleteRepository(repoName: string): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete<{ message: string }>(`/repos/${repoName}`);
  },
};
