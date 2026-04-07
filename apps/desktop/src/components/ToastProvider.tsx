import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react'
import { ToastItem, type ToastItemData, type ToastVariant } from './Toast'

const DEFAULT_SUCCESS_DURATION_MS = 4000
const DEFAULT_INFO_DURATION_MS = 4000
const CLOSE_ANIMATION_MS = 220

export interface ShowToastOptions {
    type: ToastVariant
    title: string
    detail?: string
    /** Auto-dismiss after ms. Omit: success/info use defaults; errors stay until dismissed. */
    duration?: number | null
}

interface ToastContextValue {
    showToast: (options: ShowToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

function newToastId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItemData[]>([])
    const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

    const removeAfterClose = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
        const t = timersRef.current.get(id)
        if (t) {
            clearTimeout(t)
            timersRef.current.delete(id)
        }
    }, [])

    const dismiss = useCallback(
        (id: string) => {
            const autoTimer = timersRef.current.get(id)
            if (autoTimer) {
                clearTimeout(autoTimer)
                timersRef.current.delete(id)
            }
            setToasts((prev) =>
                prev.map((t) => (t.id === id ? { ...t, closing: true } : t))
            )
            const existing = timersRef.current.get(`close-${id}`)
            if (existing) clearTimeout(existing)
            const closeTimer = setTimeout(() => {
                removeAfterClose(id)
                timersRef.current.delete(`close-${id}`)
            }, CLOSE_ANIMATION_MS)
            timersRef.current.set(`close-${id}`, closeTimer)
        },
        [removeAfterClose]
    )

    const showToast = useCallback((options: ShowToastOptions) => {
        const id = newToastId()
        const item: ToastItemData = {
            id,
            type: options.type,
            title: options.title,
            detail: options.detail,
        }
        setToasts((prev) => [...prev, item])

        let autoMs: number | null
        if (options.duration === null) {
            autoMs = null
        } else if (options.duration !== undefined) {
            autoMs = options.duration
        } else if (options.type === 'error') {
            autoMs = null
        } else if (options.type === 'info') {
            autoMs = DEFAULT_INFO_DURATION_MS
        } else {
            autoMs = DEFAULT_SUCCESS_DURATION_MS
        }

        if (autoMs !== null && autoMs > 0) {
            const timer = setTimeout(() => dismiss(id), autoMs)
            timersRef.current.set(id, timer)
        }
    }, [dismiss])

    const value = useMemo(() => ({ showToast }), [showToast])

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div
                className="fixed bottom-6 right-6 z-[110] flex flex-col gap-3 items-end pointer-events-none"
                aria-live="polite"
                aria-relevant="additions text"
                role="region"
                aria-label="Notifications"
            >
                {toasts.map((toast) => (
                    <div key={toast.id} className="pointer-events-auto">
                        <ToastItem toast={toast} onDismiss={dismiss} />
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    )
}

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext)
    if (!ctx) {
        throw new Error('useToast must be used within a ToastProvider')
    }
    return ctx
}
