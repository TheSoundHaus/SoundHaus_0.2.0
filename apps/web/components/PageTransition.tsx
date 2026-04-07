"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";

interface PageTransitionProps {
    children: React.ReactNode;
}

export default function PageTransition({ children }: PageTransitionProps) {
    const pathname = usePathname();
    const [displayChildren, setDisplayChildren] = useState(children);
    const [phase, setPhase] = useState<"enter" | "exit">("enter");
    const prevPathRef = useRef(pathname);

    useEffect(() => {
        if (pathname !== prevPathRef.current) {
            // Route changed — start exit, then swap content + enter
            setPhase("exit");
            const timer = setTimeout(() => {
                setDisplayChildren(children);
                setPhase("enter");
                prevPathRef.current = pathname;
            }, 200); // exit animation duration
            return () => clearTimeout(timer);
        } else {
            // Same route, just update children
            setDisplayChildren(children);
        }
    }, [children, pathname]);

    return (
        <div
            className={`transition-all duration-200 ease-out ${
                phase === "enter"
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-2"
            }`}
        >
            {displayChildren}
        </div>
    );
}
