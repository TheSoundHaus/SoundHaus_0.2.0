"use client";

/**
 * DefaultAvatar – SoundHaus-branded avatar fallback with waveform motif.
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
            <defs>
                <linearGradient id="avatarGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#A7C7E7" />
                    <stop offset="100%" stopColor="#7C3AED" />
                </linearGradient>
            </defs>
            <circle cx="20" cy="20" r="20" fill="url(#avatarGrad)" />
            {/* Waveform bars */}
            <rect x="10" y="16" width="2.5" height="8" rx="1.25" fill="white" opacity="0.9" />
            <rect x="14.5" y="12" width="2.5" height="16" rx="1.25" fill="white" opacity="0.9" />
            <rect x="19" y="14" width="2.5" height="12" rx="1.25" fill="white" opacity="0.9" />
            <rect x="23.5" y="10" width="2.5" height="20" rx="1.25" fill="white" opacity="0.9" />
            <rect x="28" y="15" width="2.5" height="10" rx="1.25" fill="white" opacity="0.9" />
        </svg>
    );
}
