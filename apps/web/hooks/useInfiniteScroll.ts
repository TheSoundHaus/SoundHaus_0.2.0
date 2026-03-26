import { useEffect, useRef } from 'react';

/**
 * Detects when user reaches bottom of page using Intersection Observer
 *
 * @param callback - Function to call when sentinel enters viewport
 * @param hasMore - Whether there are more items to load
 * @returns Ref to attach to sentinel element
 *
 * @example
 * const loadMore = () => setPage(prev => prev + 1);
 * const sentinelRef = useInfiniteScroll(loadMore, hasMore);
 *
 * // In JSX:
 * <div ref={sentinelRef} />
 */
export function useInfiniteScroll(
    callback: () => void,
    hasMore: boolean
): React.RefObject<HTMLDivElement> {
    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Don't set up observer if no more items to load
        if (!hasMore) return;

        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        // Create Intersection Observer
        const observer = new IntersectionObserver(
            (entries) => {
                // Call callback when sentinel enters viewport
                if (entries[0].isIntersecting) {
                    callback();
                }
            },
            {
                // Trigger when sentinel is 100px from entering viewport
                rootMargin: '100px',
            }
        );

        // Start observing
        observer.observe(sentinel);

        // Clean up observer on unmount or when dependencies change
        return () => {
            observer.disconnect();
        };
    }, [callback, hasMore]);

    return sentinelRef;
}
