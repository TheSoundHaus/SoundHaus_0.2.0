'use client';

import { useState, useMemo } from 'react';
import { SearchBar } from '@/components/SearchBar';
import { RepositoryCard } from '@/components/RepositoryCard';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { mockExploreRepos, MockExploreRepository } from '@/lib/mockData/repositories';

type SortOption = 'recent' | 'stars' | 'trending';

export default function ExplorePage() {
    // State management
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedQuery = useDebounce(searchQuery, 500);
    const [sortBy, setSortBy] = useState<SortOption>('recent');
    const [page, setPage] = useState(1);

    const itemsPerPage = 12;

    // Filter repositories by search query
    const filteredRepos = useMemo(() => {
        if (!debouncedQuery) return mockExploreRepos;

        const query = debouncedQuery.toLowerCase();
        return mockExploreRepos.filter(
            (repo) =>
                repo.title.toLowerCase().includes(query) ||
                repo.author.toLowerCase().includes(query)
        );
    }, [debouncedQuery]);

    // Sort filtered repositories
    const sortedRepos = useMemo(() => {
        const repos = [...filteredRepos];

        switch (sortBy) {
            case 'recent':
                return repos.sort(
                    (a, b) =>
                        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                );
            case 'stars':
            case 'trending': // Trending uses stars for now (placeholder)
                return repos.sort((a, b) => (b.stats.stars || 0) - (a.stats.stars || 0));
            default:
                return repos;
        }
    }, [filteredRepos, sortBy]);

    // Paginate sorted repositories
    const paginatedRepos = useMemo(() => {
        return sortedRepos.slice(0, page * itemsPerPage);
    }, [sortedRepos, page]);

    const hasMore = paginatedRepos.length < sortedRepos.length;

    // Load more repositories on scroll
    const loadMore = () => {
        if (hasMore) {
            setPage((prev) => prev + 1);
        }
    };

    const sentinelRef = useInfiniteScroll(loadMore, hasMore);

    // Reset pagination when search or sort changes
    useMemo(() => {
        setPage(1);
    }, [debouncedQuery, sortBy]);

    return (
        <div className="min-h-screen bg-midnight-950">
            {/* Header */}
            <div className="bg-navy-900/50 backdrop-blur-sm border-b border-glass-blue-500/20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <h1 className="text-4xl font-bold bg-gradient-chromatic bg-clip-text text-transparent mb-2">
                        Explore
                    </h1>
                    <p className="text-glass-blue-200">
                        Discover music projects from the community
                    </p>
                </div>
            </div>

            {/* Search and Sort Controls */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
                    {/* Search Bar */}
                    <SearchBar
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search by title or author..."
                        className="w-full sm:w-96"
                    />

                    {/* Sort Buttons */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setSortBy('recent')}
                            className={
                                sortBy === 'recent'
                                    ? 'btn-primary'
                                    : 'btn-secondary'
                            }
                        >
                            Recent
                        </button>
                        <button
                            onClick={() => setSortBy('stars')}
                            className={
                                sortBy === 'stars'
                                    ? 'btn-primary'
                                    : 'btn-secondary'
                            }
                        >
                            Top
                        </button>
                        <button
                            onClick={() => setSortBy('trending')}
                            className={
                                sortBy === 'trending'
                                    ? 'btn-primary'
                                    : 'btn-secondary'
                            }
                        >
                            Trending
                        </button>
                    </div>
                </div>

                {/* Results Count */}
                <div className="text-glass-blue-300 text-sm mb-4">
                    {debouncedQuery ? (
                        <>
                            Showing {paginatedRepos.length} of {sortedRepos.length} results
                            for &quot;{debouncedQuery}&quot;
                        </>
                    ) : (
                        <>Showing {paginatedRepos.length} repositories</>
                    )}
                </div>

                {/* Repository Grid */}
                {paginatedRepos.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {paginatedRepos.map((repo) => (
                            <RepositoryCard key={repo.id} repository={repo} />
                        ))}
                    </div>
                ) : (
                    /* Empty State */
                    <div className="text-center py-12">
                        <div className="text-glass-blue-400 text-lg mb-2">
                            No repositories found
                        </div>
                        {debouncedQuery && (
                            <div className="text-glass-blue-500 text-sm">
                                Try a different search term
                            </div>
                        )}
                    </div>
                )}

                {/* Infinite Scroll Sentinel */}
                {hasMore && <div ref={sentinelRef} className="h-10" />}

                {/* End of Results Message */}
                {!hasMore && paginatedRepos.length > 0 && (
                    <div className="text-center py-8 text-glass-blue-500 text-sm">
                        You&apos;ve reached the end
                    </div>
                )}
            </div>
        </div>
    );
}
