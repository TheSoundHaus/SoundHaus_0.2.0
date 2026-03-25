'use client';

import { useDebounce } from '@/hooks/useDebounce';
import { useState, useEffect } from 'react';

export interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

/**
 * Search input component with debouncing
 *
 * Features:
 * - Debounced onChange (500ms delay)
 * - Clear button when text is entered
 * - Search icon indicator
 * - Accessible with ARIA labels
 */
export function SearchBar({
    value,
    onChange,
    placeholder = 'Search repositories...',
    className = '',
}: SearchBarProps) {
    const [localValue, setLocalValue] = useState(value);
    const debouncedValue = useDebounce(localValue, 500);

    // Sync debounced value to parent
    useEffect(() => {
        onChange(debouncedValue);
    }, [debouncedValue, onChange]);

    // Sync external value changes to local state
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const handleClear = () => {
        setLocalValue('');
    };

    return (
        <div className={`relative ${className}`}>
            {/* Search Icon */}
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-glass-blue-400">
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
                placeholder={placeholder}
                className="input w-full pl-10 pr-10"
                aria-label="Search repositories"
            />

            {/* Clear Button */}
            {localValue && (
                <button
                    onClick={handleClear}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-glass-blue-400 hover:text-glass-blue-300 transition-colors"
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
        </div>
    );
}
