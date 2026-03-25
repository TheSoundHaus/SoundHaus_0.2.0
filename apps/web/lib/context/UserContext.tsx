"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { getProfileAction } from "@/actions/profile";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UserProfile {
    id: string;
    email: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    is_public: boolean;
    created_at: string | null;
    updated_at: string | null;
}

interface UserContextValue {
    user: UserProfile | null;
    loading: boolean;
    error: string | null;
    refreshUser: () => Promise<void>;
}

// ─── Context ────────────────────────────────────────────────────────────────

const UserContext = createContext<UserContextValue>({
    user: null,
    loading: true,
    error: null,
    refreshUser: async () => {},
});

export function useUser() {
    return useContext(UserContext);
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function UserProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refreshUser = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getProfileAction();
            if (result.success) {
                setUser(result.profile);
            } else {
                setError(result.error);
                setUser(null);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load profile");
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshUser();
    }, [refreshUser]);

    return (
        <UserContext.Provider value={{ user, loading, error, refreshUser }}>
            {children}
        </UserContext.Provider>
    );
}
