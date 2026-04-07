import { useState } from 'react'
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Info, X } from 'lucide-react'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastItemData {
    id: string
    type: ToastVariant
    title: string
    detail?: string
    closing?: boolean
}

interface ToastItemProps {
    toast: ToastItemData
    onDismiss: (id: string) => void
}

/**
 * Single toast surface: glass panel, semantic icon, optional expandable detail.
 */
export function ToastItem({ toast, onDismiss }: ToastItemProps) {
    const [detailExpanded, setDetailExpanded] = useState(false)
    const hasDetail = Boolean(toast.detail && toast.detail.trim().length > 0)
    const detailLong = (toast.detail?.length ?? 0) > 140 || (toast.detail?.split('\n').length ?? 0) > 3

    const icon =
        toast.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-success shrink-0" aria-hidden />
        ) : toast.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-error shrink-0" aria-hidden />
        ) : (
            <Info className="w-5 h-5 text-accent shrink-0" aria-hidden />
        )

    return (
        <div
            className={`
                relative glass-panel rounded-xl shadow-elevated border border-border-default
                p-3.5 pr-10 min-w-[280px] max-w-[min(420px,calc(100vw-3rem))]
                animate-slide-up transition-opacity duration-200
                ${toast.closing ? 'opacity-0' : 'opacity-100'}
            `}
        >
            <div className="flex gap-3 items-start">
                {icon}
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary leading-snug">{toast.title}</p>
                    {hasDetail && (
                        <>
                            <div
                                className={`
                                    mt-1.5 text-xs text-text-secondary font-mono whitespace-pre-wrap break-words
                                    ${detailLong && !detailExpanded ? 'max-h-[4.5rem] overflow-hidden' : ''}
                                `}
                            >
                                {toast.detail}
                            </div>
                            {detailLong && (
                                <button
                                    type="button"
                                    onClick={() => setDetailExpanded((e) => !e)}
                                    className="mt-1 flex items-center gap-1 text-xs text-accent hover:text-accent-highlight transition-colors cursor-pointer"
                                >
                                    {detailExpanded ? (
                                        <>
                                            <ChevronUp className="w-3.5 h-3.5" />
                                            Show less
                                        </>
                                    ) : (
                                        <>
                                            <ChevronDown className="w-3.5 h-3.5" />
                                            Show more
                                        </>
                                    )}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
            <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="absolute top-2.5 right-2.5 flex items-center justify-center w-7 h-7 rounded-lg
                           text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/60
                           transition-all duration-200 cursor-pointer"
                aria-label="Dismiss notification"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    )
}
