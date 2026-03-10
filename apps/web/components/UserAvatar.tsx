"use client";

import DefaultAvatar from "./DefaultAvatar";

/**
 * UserAvatar – Displays a user's avatar image or the default silhouette.
 * Handles loading states and broken image URLs gracefully.
 */
export default function UserAvatar({
    src,
    alt = "User avatar",
    size = 32,
    className = "",
}: {
    src?: string | null;
    alt?: string;
    size?: number;
    className?: string;
}) {
    if (!src) {
        return <DefaultAvatar size={size} className={`rounded-full ${className}`} />;
    }

    return (
        <img
            src={src}
            alt={alt}
            width={size}
            height={size}
            className={`rounded-full object-cover ${className}`}
            style={{ width: size, height: size }}
            onError={(e) => {
                // Hide broken image and show nothing (parent should have fallback bg)
                (e.target as HTMLImageElement).style.display = "none";
            }}
        />
    );
}
