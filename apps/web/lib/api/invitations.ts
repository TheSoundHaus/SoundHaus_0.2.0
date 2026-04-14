"use server";

import type { ApiResponse, Invitation, SentInvitation, Collaborator, UserSearchResult } from "../types/api";
import { authFetch } from "./client";

// GET /invitations/pending — list pending invitations for the current user
export async function getPendingInvitations(): Promise<ApiResponse<Invitation[]>> {
    const result = await authFetch<{ invitations: Invitation[] }>("/invitations/pending");
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data?.invitations ?? [] };
}

// POST /invitations/{id}/accept — accept a collaboration invitation
export async function acceptInvitation(invitationId: string): Promise<ApiResponse<{ message: string }>> {
    const result = await authFetch<{ message: string }>(
        `/invitations/${invitationId}/accept`,
        { method: "POST" },
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data };
}

// POST /invitations/{id}/decline — decline a collaboration invitation
export async function declineInvitation(invitationId: string): Promise<ApiResponse<{ message: string }>> {
    const result = await authFetch<{ message: string }>(
        `/invitations/${invitationId}/decline`,
        { method: "POST" },
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data };
}

// GET /repos/{owner}/{repo_name}/invitations — list all invitations sent by owner for a repo
export async function getRepoInvitations(owner: string, repoName: string): Promise<ApiResponse<SentInvitation[]>> {
    const o = encodeURIComponent(owner);
    const r = encodeURIComponent(repoName);
    const result = await authFetch<{ invitations: SentInvitation[] }>(`/repos/${o}/${r}/invitations`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data?.invitations ?? [] };
}

// GET /invitations/sent — list all invitations sent by current user across all repos
export async function getSentInvitations(): Promise<ApiResponse<SentInvitation[]>> {
    const result = await authFetch<{ invitations: SentInvitation[] }>("/invitations/sent");
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data?.invitations ?? [] };
}

// DELETE /invitations/{id} — cancel a pending invitation
export async function cancelInvitation(invitationId: string): Promise<ApiResponse<{ message: string }>> {
    const result = await authFetch<{ message: string }>(
        `/invitations/${invitationId}`,
        { method: "DELETE" },
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data };
}

// POST /repos/{owner}/{repo_name}/collaborators/invite — invite a user by email
export async function inviteCollaborator(
    owner: string,
    repoName: string,
    email: string,
    permission: string = "write",
): Promise<ApiResponse<{ invitation_id: string; message: string }>> {
    const o = encodeURIComponent(owner);
    const r = encodeURIComponent(repoName);
    const result = await authFetch<{ invitation_id: string; message: string }>(
        `/repos/${o}/${r}/collaborators/invite`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, permission }),
        },
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data };
}

// GET /repos/{owner}/{repo_name}/collaborators — list active collaborators
export async function listCollaborators(owner: string, repoName: string): Promise<ApiResponse<Collaborator[]>> {
    const result = await authFetch<{ collaborators: Collaborator[] }>(`/repos/${owner}/${repoName}/collaborators`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data?.collaborators ?? [] };
}

// DELETE /repos/{owner}/{repo_name}/collaborators/{username} — remove a collaborator
export async function removeCollaborator(
    owner: string,
    repoName: string,
    username: string,
): Promise<ApiResponse<{ message: string }>> {
    const o = encodeURIComponent(owner);
    const r = encodeURIComponent(repoName);
    const u = encodeURIComponent(username);
    const result = await authFetch<{ message: string }>(
        `/repos/${o}/${r}/collaborators/${u}`,
        { method: "DELETE" },
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data };
}

// GET /users/search — search users by email/username
export async function searchUsers(query: string): Promise<ApiResponse<UserSearchResult[]>> {
    const result = await authFetch<{ users: UserSearchResult[] }>(`/users/search?q=${encodeURIComponent(query)}`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data?.users ?? [] };
}

// GET /repos/{owner}/{repo_name}/collaboration-status — check current user's collab status
export type CollabStatus = "collaborator" | "pending" | "none";
export interface CollabStatusResponse {
    status: CollabStatus;
    invitation_id?: string;
}
export async function getCollaborationStatus(
    owner: string,
    repoName: string,
): Promise<ApiResponse<CollabStatusResponse>> {
    const o = encodeURIComponent(owner);
    const r = encodeURIComponent(repoName);
    const result = await authFetch<CollabStatusResponse & { success: boolean }>(
        `/repos/${o}/${r}/collaboration-status`,
    );
    if (!result.success) return { success: false, error: result.error };
    return {
        success: true,
        data: {
            status: result.data?.status ?? "none",
            invitation_id: result.data?.invitation_id,
        },
    };
}
