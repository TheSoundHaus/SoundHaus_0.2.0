/**
 * Users API
 * API calls for user profiles and authentication
 */

import { apiClient } from './client';
import { ApiResponse } from '@/types/api';
import { User, UserProfile, Invitation } from '@/types/user';
import { Repository } from '@/types/repository';

export const usersApi = {
  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<ApiResponse<User>> {
    const response = await apiClient.get<{ user: User }>('/api/auth/user');
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.user,
      };
    }
    return response as ApiResponse<User>;
  },

  /**
   * Get user profile by username
   * Note: This may need to be implemented in backend or call Gitea directly
   */
  async getUserProfile(username: string): Promise<ApiResponse<UserProfile>> {
    // Try backend endpoint first
    const response = await apiClient.get<UserProfile>(`/users/${username}`);

    // If not found, fallback to Gitea API (if we need to implement this)
    if (!response.success) {
      // TODO: Implement Gitea user API fallback if needed
      return response;
    }

    return response;
  },

  /**
   * Get user's public repositories
   * Note: May need backend implementation
   */
  async getUserRepositories(username: string): Promise<ApiResponse<Repository[]>> {
    const response = await apiClient.get<{ repos: Repository[] }>(
      `/users/${username}/repos`
    );
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.repos,
      };
    }
    return response as ApiResponse<Repository[]>;
  },

  /**
   * Get pending invitations for current user
   */
  async getPendingInvitations(): Promise<ApiResponse<Invitation[]>> {
    const response = await apiClient.get<{ invitations: Invitation[] }>(
      '/invitations/pending'
    );
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.invitations,
      };
    }
    return response as ApiResponse<Invitation[]>;
  },

  /**
   * Accept an invitation
   */
  async acceptInvitation(invitationId: string): Promise<ApiResponse<{ message: string }>> {
    return apiClient.post<{ message: string }>(`/invitations/${invitationId}/accept`);
  },

  /**
   * Decline an invitation
   */
  async declineInvitation(invitationId: string): Promise<ApiResponse<{ message: string }>> {
    return apiClient.post<{ message: string }>(`/invitations/${invitationId}/decline`);
  },

  /**
   * Update user profile
   * Note: May need backend implementation
   */
  async updateProfile(data: Partial<UserProfile>): Promise<ApiResponse<UserProfile>> {
    return apiClient.patch<UserProfile>('/api/auth/user', data);
  },
};
