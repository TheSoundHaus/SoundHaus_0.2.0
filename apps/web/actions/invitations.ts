"use server";

import {
    acceptInvitation,
    declineInvitation,
    inviteCollaborator,
    cancelInvitation,
    removeCollaborator,
} from "@/lib/api/invitations";

export async function acceptInvitationAction(
    invitationId: string,
): Promise<{ success: true } | { success: false; error: string }> {
    try {
        const result = await acceptInvitation(invitationId);
        if (!result.success) return { success: false, error: result.error };
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to accept invitation" };
    }
}

export async function declineInvitationAction(
    invitationId: string,
): Promise<{ success: true } | { success: false; error: string }> {
    try {
        const result = await declineInvitation(invitationId);
        if (!result.success) return { success: false, error: result.error };
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to decline invitation" };
    }
}

export async function inviteCollaboratorAction(
    owner: string,
    repoName: string,
    email: string,
    permission: string = "write",
): Promise<{ success: true } | { success: false; error: string }> {
    try {
        const result = await inviteCollaborator(owner, repoName, email, permission);
        if (!result.success) return { success: false, error: result.error };
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to invite collaborator" };
    }
}

export async function cancelInvitationAction(
    invitationId: string,
): Promise<{ success: true } | { success: false; error: string }> {
    try {
        const result = await cancelInvitation(invitationId);
        if (!result.success) return { success: false, error: result.error };
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to cancel invitation" };
    }
}

export async function removeCollaboratorAction(
    owner: string,
    repoName: string,
    username: string,
): Promise<{ success: true } | { success: false; error: string }> {
    try {
        const result = await removeCollaborator(owner, repoName, username);
        if (!result.success) return { success: false, error: result.error };
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to remove collaborator" };
    }
}
