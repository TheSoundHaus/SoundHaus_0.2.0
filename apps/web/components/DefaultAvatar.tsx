"use client";

/**
 * DefaultAvatar – YouTube-style silhouette avatar fallback.
 * Used anywhere a user has no custom profile picture.
 */
export default function DefaultAvatar({
    size = 32,
    className = "",
}: {
    size?: number;
    className?: string;
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <circle cx="20" cy="20" r="20" fill="#3f3f46" />
            {/* Head */}
            <circle cx="20" cy="15" r="7" fill="#71717a" />
            {/* Body / shoulders */}
            <ellipse cx="20" cy="34" rx="13" ry="10" fill="#71717a" />
        </svg>
    );
}
