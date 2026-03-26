import { authenticatedFetch } from "@/lib/utils/auth";
import type { SentInvitation, Invitation } from "@/lib/types/api";

/**
 * API functions for managing repository invitations
 * All functions use authenticatedFetch which handles tokens automatically
 */

type APIResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Get all invitations sent by the current user
 * GET /invitations/sent
 */
export async function getSentInvitations(): Promise<APIResponse<SentInvitation[]>> {
  try {
    const response = await authenticatedFetch("/invitations/sent");

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || errorData.detail || "Failed to fetch sent invitations",
      };
    }

    const data = await response.json();
    return { success: true, data: data.invitations || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Get pending invitations for the current user
 * GET /invitations/pending
 */
export async function getPendingInvitations(): Promise<APIResponse<Invitation[]>> {
  try {
    const response = await authenticatedFetch("/invitations/pending");

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || errorData.detail || "Failed to fetch pending invitations",
      };
    }

    const data = await response.json();
    return { success: true, data: data.invitations || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Accept an invitation
 * POST /invitations/{invitation_id}/accept
 */
export async function acceptInvitation(invitationId: number): Promise<APIResponse<void>> {
  try {
    const response = await authenticatedFetch(`/invitations/${invitationId}/accept`, {
      method: "POST",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || errorData.detail || "Failed to accept invitation",
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Decline an invitation
 * POST /invitations/{invitation_id}/decline
 */
export async function declineInvitation(invitationId: number): Promise<APIResponse<void>> {
  try {
    const response = await authenticatedFetch(`/invitations/${invitationId}/decline`, {
      method: "POST",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || errorData.detail || "Failed to decline invitation",
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Invite a collaborator to a repository
 * POST /repos/{repo_name}/invitations
 */
export async function inviteCollaborator(
  repoName: string,
  email: string,
  permission: string = "write"
): Promise<APIResponse<void>> {
  try {
    const response = await authenticatedFetch(`/repos/${repoName}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email, permission }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || errorData.detail || "Failed to send invitation",
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Cancel a pending invitation
 * DELETE /invitations/{invitation_id}
 */
export async function cancelInvitation(invitationId: string): Promise<APIResponse<void>> {
  try {
    const response = await authenticatedFetch(`/invitations/${invitationId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || errorData.detail || "Failed to cancel invitation",
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Remove a collaborator from a repository
 * DELETE /repos/{repo_name}/collaborators/{username}
 */
export async function removeCollaborator(
  repoName: string,
  username: string
): Promise<APIResponse<void>> {
  try {
    const response = await authenticatedFetch(`/repos/${repoName}/collaborators/${username}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || errorData.detail || "Failed to remove collaborator",
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Get invitations for a specific repository
 * GET /repos/{repo_name}/invitations
 */
export async function getRepoInvitations(repoName: string): Promise<APIResponse<SentInvitation[]>> {
  try {
    const response = await authenticatedFetch(`/repos/${repoName}/invitations`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || errorData.detail || "Failed to fetch repository invitations",
      };
    }

    const data = await response.json();
    return { success: true, data: data.invitations || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}
