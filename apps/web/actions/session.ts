"use server";

import { redirect } from "next/navigation";
import { clearAuthCookies } from "@/lib/utils/auth";

/**
 * Clears session cookies and sends the user to login with an expiry hint.
 * Intended after refresh fails or the profile endpoint returns 401.
 */
export async function clearSessionAndRedirectToLogin(): Promise<void> {
    await clearAuthCookies();
    redirect("/login?expired=1");
}
