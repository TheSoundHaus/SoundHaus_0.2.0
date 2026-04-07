"use client";

import { useState } from "react";
import DefaultAvatar from "./DefaultAvatar";

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
    const [failed, setFailed] = useState(false);

    if (!src || failed) {
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
            onError={() => setFailed(true)}
        />
    );
}
