import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

    // Fetch menu entries each time the palette opens
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
        // Focus input on next tick (after render)
        requestAnimationFrame(() => inputRef.current?.focus())
    }, [isOpen])

    // Filter and rank entries based on query (case-insensitive)
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

    // Reset selection when filtered list changes
    useEffect(() => {
        setSelectedIndex(0)
    }, [filtered])

    // Scroll selected item into view
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
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                zIndex: 9999,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                paddingTop: '60px',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                onKeyDown={handleKeyDown}
                style={{
                    width: '480px',
                    maxHeight: '380px',
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
            >
                <div style={{ padding: '12px 12px 8px' }}>
                    <input
                        ref={inputRef}
                        type="text"
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search menu actions..."
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            boxSizing: 'border-box',
                            borderRadius: '6px',
                            border: '1px solid #ccc',
                            fontSize: '14px',
                            outline: 'none',
                        }}
                    />
                </div>

                <div
                    ref={listRef}
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        borderTop: '1px solid #e0e0e0',
                    }}
                >
                    {filtered.length === 0 && (
                        <div style={{ padding: '16px', color: '#888', textAlign: 'center', fontSize: '13px' }}>
                            {query.trim() ? 'No matching actions' : 'Loading...'}
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
                                style={{
                                    padding: '8px 12px',
                                    cursor: isDisabled ? 'default' : 'pointer',
                                    backgroundColor: isSelected ? '#007acc' : 'transparent',
                                    color: isDisabled
                                        ? '#aaa'
                                        : isSelected
                                          ? '#fff'
                                          : '#222',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px',
                                    opacity: isDisabled ? 0.5 : 1,
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 500 }}>
                                        {entry.label}
                                    </span>
                                    {entry.accelerator && (
                                        <span
                                            style={{
                                                fontSize: '11px',
                                                color: isSelected ? 'rgba(255,255,255,0.6)' : '#aaa',
                                                fontFamily: 'monospace',
                                                flexShrink: 0,
                                                marginLeft: '12px',
                                            }}
                                        >
                                            {entry.accelerator.replace(/CmdOrCtrl/g, navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl')}
                                        </span>
                                    )}
                                </div>
                                <span
                                    style={{
                                        fontSize: '11px',
                                        color: isSelected ? 'rgba(255,255,255,0.7)' : '#888',
                                    }}
                                >
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
