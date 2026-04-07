import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'

interface MenuEntry {
    label: string
    breadcrumb: string
    action: string | null
    payload?: Record<string, unknown>
    enabled: boolean
    accelerator?: string
}

interface SearchPaletteProps {
    isOpen: boolean
    onClose: () => void
}

const SearchPalette = ({ isOpen, onClose }: SearchPaletteProps) => {
    const [query, setQuery] = useState('')
    const [entries, setEntries] = useState<MenuEntry[]>([])
    const [selectedIndex, setSelectedIndex] = useState(0)
    const listRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!isOpen) return
        setQuery('')
        setSelectedIndex(0)
        const load = async () => {
            try {
                const data = await window.electron?.getSearchMenuEntries()
                if (data) setEntries(data)
            } catch (err) {
                console.error('Failed to load menu entries:', err)
            }
        }
        void load()
        requestAnimationFrame(() => inputRef.current?.focus())
    }, [isOpen])

    const filtered = useMemo(() => {
        if (!query.trim()) return entries
        const q = query.toLowerCase()
        return entries
            .filter(
                (e) => e.label.toLowerCase().includes(q) || e.breadcrumb.toLowerCase().includes(q)
            )
            .sort((a, b) => {
                const aLabel = a.label.toLowerCase()
                const bLabel = b.label.toLowerCase()
                const aExact = aLabel === q ? 0 : 1
                const bExact = bLabel === q ? 0 : 1
                if (aExact !== bExact) return aExact - bExact
                const aStarts = aLabel.startsWith(q) ? 0 : 1
                const bStarts = bLabel.startsWith(q) ? 0 : 1
                if (aStarts !== bStarts) return aStarts - bStarts
                const aInLabel = aLabel.includes(q) ? 0 : 1
                const bInLabel = bLabel.includes(q) ? 0 : 1
                if (aInLabel !== bInLabel) return aInLabel - bInLabel
                if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
                return 0
            })
    }, [entries, query])

    useEffect(() => {
        setSelectedIndex(0)
    }, [filtered])

    useEffect(() => {
        const list = listRef.current
        if (!list) return
        const item = list.children[selectedIndex] as HTMLElement | undefined
        item?.scrollIntoView({ block: 'nearest' })
    }, [selectedIndex])

    const handleSelect = useCallback((entry: MenuEntry) => {
        if (!entry.action || !entry.enabled) return
        onClose()
        window.dispatchEvent(
            new CustomEvent('soundhaus:execute-search-action', {
                detail: { action: entry.action, payload: entry.payload },
            })
        )
    }, [onClose])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault()
                setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
                break
            case 'ArrowUp':
                e.preventDefault()
                setSelectedIndex((i) => Math.max(i - 1, 0))
                break
            case 'Enter': {
                e.preventDefault()
                const entry = filtered[selectedIndex]
                if (entry) handleSelect(entry)
                break
            }
            case 'Escape':
                e.preventDefault()
                onClose()
                break
        }
    }, [filtered, selectedIndex, handleSelect, onClose])

    if (!isOpen) return null

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-[9999] flex justify-center items-start pt-[60px]"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                onKeyDown={handleKeyDown}
                className="w-[480px] max-h-[380px] glass-panel-heavy rounded-xl flex flex-col overflow-hidden animate-scale-in"
            >
                <div className="p-3 pb-2">
                    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-bg-primary/60 border border-border-default">
                        <Search className="w-4 h-4 text-text-tertiary shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search menu actions…"
                            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
                        />
                    </div>
                </div>

                <div
                    ref={listRef}
                    className="flex-1 overflow-y-auto border-t border-border-subtle"
                >
                    {filtered.length === 0 && (
                        <div className="py-4 text-center text-sm text-text-tertiary">
                            {query.trim() ? 'No matching actions' : 'Loading…'}
                        </div>
                    )}
                    {filtered.map((entry, i) => {
                        const isSelected = i === selectedIndex
                        const isDisabled = !entry.action || !entry.enabled
                        return (
                            <div
                                key={`${entry.breadcrumb}-${i}`}
                                onClick={() => handleSelect(entry)}
                                onMouseEnter={() => setSelectedIndex(i)}
                                className={`
                                    flex flex-col gap-0.5 px-3 py-2 transition-colors duration-100
                                    ${isDisabled ? 'opacity-50 cursor-default' : 'cursor-pointer'}
                                    ${isSelected ? 'bg-accent/15 text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary/40'}
                                `}
                            >
                                <div className="flex justify-between items-center">
                                    <span className={`text-[13px] font-medium ${isSelected ? 'text-accent' : ''}`}>
                                        {entry.label}
                                    </span>
                                    {entry.accelerator && (
                                        <span className="text-[11px] text-text-tertiary font-mono shrink-0 ml-3">
                                            {entry.accelerator.replace(/CmdOrCtrl/g, navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl')}
                                        </span>
                                    )}
                                </div>
                                <span className="text-[11px] text-text-tertiary">
                                    {entry.breadcrumb}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

export default SearchPalette
