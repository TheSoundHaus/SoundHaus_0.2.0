import { useEffect, useRef, type FC } from 'react'
import { AlertTriangle, Music } from 'lucide-react'

export type InvalidProjectNoticeVariant = 'recent' | 'filepath' | 'filepath-ableton'

interface InvalidProjectNoticeProps {
    open: boolean
    variant: InvalidProjectNoticeVariant
    projectPath: string
    onDismiss: () => void
    /** Only for `recent` variant: removes from recents list. */
    onRemoveFromRecents?: () => void | Promise<void>
    /** Only for `filepath-ableton` variant: runs project setup + initRepo. */
    onSetupAsSoundHaus?: () => void | Promise<void>
}

/**
 * Centered overlay styled like a toast (glass, semantic icon) so invalid-project feedback
 * stays visible above the Open Project dialog (z above parent modal).
 */
const InvalidProjectNotice: FC<InvalidProjectNoticeProps> = ({
    open,
    variant,
    projectPath,
    onDismiss,
    onRemoveFromRecents,
    onSetupAsSoundHaus,
}) => {
    const panelRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                onDismiss()
            }
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
    }, [open, onDismiss])

    if (!open) return null

    const isRecent = variant === 'recent'
    const isAbletonFolder = variant === 'filepath-ableton'

    const icon = isAbletonFolder ? (
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent/10 shrink-0">
            <Music className="w-5 h-5 text-accent" aria-hidden />
        </div>
    ) : (
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-error-soft shrink-0">
            <AlertTriangle className="w-5 h-5 text-error" aria-hidden />
        </div>
    )

    const title = isAbletonFolder
        ? 'Ableton project found'
        : 'Not a SoundHaus project'

    const body = isRecent
        ? "This isn't a valid SoundHaus project. Remove it from the list?"
        : isAbletonFolder
        ? "This folder has an Ableton project but isn't tracked by SoundHaus yet. Add SoundHaus tracking to start saving snapshots and collaborating."
        : "This folder doesn't look like it's compatible with SoundHaus. Choose a folder that's already a SoundHaus project, or pick an Ableton Project."

    return (
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-6"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
            onClick={onDismiss}
            role="presentation"
        >
            <div
                ref={panelRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="invalid-project-title"
                aria-describedby="invalid-project-desc"
                className="relative w-full max-w-md glass-panel rounded-xl shadow-elevated border border-border-default
                           p-5 animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex gap-3 items-start">
                    {icon}
                    <div className="min-w-0 flex-1 pt-0.5">
                        <h2
                            id="invalid-project-title"
                            className="text-sm font-semibold text-text-primary leading-snug"
                        >
                            {title}
                        </h2>
                        <p
                            id="invalid-project-desc"
                            className="mt-2 text-sm text-text-secondary leading-relaxed"
                        >
                            {body}
                        </p>
                        {projectPath.trim().length > 0 && (
                            <p className="mt-2 text-xs text-text-tertiary font-mono break-all leading-snug">
                                {projectPath}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 mt-5">
                    {isRecent ? (
                        <>
                            <button
                                type="button"
                                onClick={onDismiss}
                                className="px-4 py-2.5 rounded-xl text-sm font-medium
                                           bg-bg-primary/40 border border-border-default text-text-secondary
                                           hover:text-text-primary hover:bg-bg-elevated
                                           transition-all duration-200 cursor-pointer"
                            >
                                Keep in list
                            </button>
                            <button
                                type="button"
                                onClick={() => void onRemoveFromRecents?.()}
                                className="px-4 py-2.5 rounded-xl text-sm font-semibold
                                           border border-error/40 text-error bg-error-soft
                                           hover:bg-error-soft/80 hover:border-error/60
                                           transition-all duration-200 cursor-pointer"
                            >
                                Remove from list
                            </button>
                        </>
                    ) : isAbletonFolder ? (
                        <>
                            <button
                                type="button"
                                onClick={onDismiss}
                                className="px-4 py-2.5 rounded-xl text-sm font-medium
                                           bg-bg-primary/40 border border-border-default text-text-secondary
                                           hover:text-text-primary hover:bg-bg-elevated
                                           transition-all duration-200 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void onSetupAsSoundHaus?.()}
                                className="px-4 py-2.5 rounded-xl text-sm font-semibold btn-brand
                                           transition-all duration-200 cursor-pointer"
                            >
                                Set up SoundHaus project
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={onDismiss}
                            className="px-4 py-2.5 rounded-xl text-sm font-semibold btn-brand
                                       transition-all duration-200 cursor-pointer"
                        >
                            OK
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

export default InvalidProjectNotice
