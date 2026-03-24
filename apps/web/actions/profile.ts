"use server";

import {
    getProfile,
    updateProfile,
    uploadAvatar,
    deleteAvatar,
    type UserProfile,
} from "@/lib/api/profile";

export async function getProfileAction(): Promise<
    { success: true; profile: UserProfile } | { success: false; error: string }
> {
    try {
        const result = await getProfile();
        if (!result.success) return { success: false, error: result.error };
        return { success: true, profile: result.data! };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to load profile" };
    }
}

export async function updateProfileAction(
    updates: { display_name?: string; bio?: string }
): Promise<{ success: true; profile: UserProfile } | { success: false; error: string }> {
    try {
        const result = await updateProfile(updates);
        if (!result.success) return { success: false, error: result.error };
        return { success: true, profile: result.data! };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to update profile" };
    }
}

export async function uploadAvatarAction(
    formData: FormData
): Promise<{ success: true; avatar_url: string } | { success: false; error: string }> {
    try {
        const result = await uploadAvatar(formData);
        if (!result.success) return { success: false, error: result.error };
        return { success: true, avatar_url: result.data!.avatar_url };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to upload avatar" };
    }
}

export async function deleteAvatarAction(): Promise<
    { success: true } | { success: false; error: string }
> {
    try {
        const result = await deleteAvatar();
        if (!result.success) return { success: false, error: result.error };
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to delete avatar" };
    }
}
