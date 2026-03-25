'use client';

import { useDebounce } from '@/hooks/useDebounce';
import { useState, useEffect, useRef, useMemo } from 'react';

export interface SearchSuggestion {
    id: string;
    title: string;
    author: string;
    type: 'repository' | 'author';
}

export interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    suggestions?: SearchSuggestion[];
    onSuggestionClick?: (suggestion: SearchSuggestion) => void;
    showSuggestions?: boolean;
    // Auto-generate suggestions from repository data
    repositories?: Array<{
        id: string;
        title: string;
        author: string;
    }>;
    maxSuggestions?: number;
}

/**
 * Search input component with debouncing and autocomplete
 *
 * Features:
 * - Debounced onChange (500ms delay)
 * - Autocomplete dropdown with suggestions
 * - Clear button when text is entered
 * - Search icon indicator
 * - Accessible with ARIA labels
 * - Keyboard navigation (arrow keys, enter, escape)
 */
export function SearchBar({
    value,
    onChange,
    placeholder = 'Search repositories...',
    className = '',
    suggestions = [],
    onSuggestionClick,
    showSuggestions = true,
    repositories = [],
    maxSuggestions = 5,
}: SearchBarProps) {
    const [localValue, setLocalValue] = useState(value);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const debouncedValue = useDebounce(localValue, 300);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Generate suggestions from repositories if not provided
    const computedSuggestions = useMemo(() => {
        if (suggestions.length > 0) {
            return suggestions;
        }

        if (!localValue || repositories.length === 0) {
            return [];
        }

        const query = localValue.toLowerCase();
        const matches: SearchSuggestion[] = [];
        const seen = new Set<string>();

        // First, find repository title matches
        repositories.forEach((repo) => {
            if (repo.title.toLowerCase().includes(query)) {
                const key = `repo-${repo.id}`;
                if (!seen.has(key) && matches.length < maxSuggestions) {
                    matches.push({
                        id: repo.id,
                        title: repo.title,
                        author: repo.author,
                        type: 'repository',
                    });
                    seen.add(key);
                }
            }
        });

        // Then, find author matches (if we still have room)
        if (matches.length < maxSuggestions) {
            const authorMatches = new Map<string, SearchSuggestion>();
            repositories.forEach((repo) => {
                if (repo.author.toLowerCase().includes(query)) {
                    const key = `author-${repo.author}`;
                    if (!authorMatches.has(key)) {
                        authorMatches.set(key, {
                            id: `author-${repo.author}`,
                            title: `All projects by ${repo.author}`,
                            author: repo.author,
                            type: 'author',
                        });
                    }
                }
            });

            authorMatches.forEach((suggestion) => {
                if (matches.length < maxSuggestions) {
                    matches.push(suggestion);
                }
            });
        }

        return matches;
    }, [localValue, suggestions, repositories, maxSuggestions]);

    // Sync debounced value to parent
    useEffect(() => {
        onChange(debouncedValue);
    }, [debouncedValue, onChange]);

    // Sync external value changes to local state
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Show suggestions when typing
    useEffect(() => {
        if (localValue.length > 0 && computedSuggestions.length > 0 && showSuggestions) {
            setIsOpen(true);
            setSelectedIndex(-1);
        } else {
            setIsOpen(false);
        }
    }, [localValue, computedSuggestions.length, showSuggestions]);

    const handleClear = () => {
        setLocalValue('');
        setIsOpen(false);
    };

    const handleSuggestionClick = (suggestion: SearchSuggestion) => {
        if (suggestion.type === 'repository') {
            setLocalValue(suggestion.title);
        } else {
            setLocalValue(suggestion.author);
        }
        setIsOpen(false);
        onSuggestionClick?.(suggestion);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen || computedSuggestions.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex((prev) =>
                    prev < computedSuggestions.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < computedSuggestions.length) {
                    handleSuggestionClick(computedSuggestions[selectedIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                break;
        }
    };

    return (
        <div ref={wrapperRef} className={`relative ${className}`}>
            {/* Search Icon */}
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-glass-blue-400 z-10">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                </svg>
            </div>

            {/* Input */}
            <input
                type="text"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="input w-full pl-10 pr-10"
                aria-label="Search repositories"
                aria-autocomplete="list"
                aria-expanded={isOpen}
                aria-controls="search-suggestions"
            />

            {/* Clear Button */}
            {localValue && (
                <button
                    onClick={handleClear}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-glass-blue-400 hover:text-glass-blue-300 transition-colors z-10"
                    aria-label="Clear search"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            )}

            {/* Suggestions Dropdown */}
            {isOpen && computedSuggestions.length > 0 && (
                <div
                    id="search-suggestions"
                    className="absolute top-full left-0 right-0 mt-2 bg-navy-900 border border-glass-blue-500/30 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50"
                    role="listbox"
                >
                    {computedSuggestions.map((suggestion, index) => (
                        <button
                            key={suggestion.id}
                            onClick={() => handleSuggestionClick(suggestion)}
                            className={`w-full text-left px-4 py-3 hover:bg-glass-blue-500/10 transition-colors border-b border-glass-blue-500/10 last:border-b-0 ${
                                index === selectedIndex ? 'bg-glass-blue-500/20' : ''
                            }`}
                            role="option"
                            aria-selected={index === selectedIndex}
                        >
                            <div className="flex items-center gap-3">
                                {/* Icon based on type */}
                                <div className="flex-shrink-0 text-glass-blue-400">
                                    {suggestion.type === 'repository' ? (
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-5 w-5"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                            />
                                        </svg>
                                    ) : (
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-5 w-5"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                            />
                                        </svg>
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-glass-blue-100 font-medium truncate">
                                        {suggestion.title}
                                    </div>
                                    <div className="text-glass-blue-400 text-sm truncate">
                                        by {suggestion.author}
                                    </div>
                                </div>

                                {/* Type badge */}
                                <div className="flex-shrink-0">
                                    <span className="text-xs text-glass-blue-500 bg-glass-blue-500/10 px-2 py-1 rounded">
                                        {suggestion.type}
                                    </span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
