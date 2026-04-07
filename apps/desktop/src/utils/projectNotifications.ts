import type { ShowToastOptions } from '../components/ToastProvider'
import type { GitError } from '../hooks/useProjectGitActions'

type ShowToast = (options: ShowToastOptions) => void

function detailFromUnknown(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }
    return String(error)
}

/**
 * Producer-friendly copy for git operations (shared by Project page and menu / command palette).
 */
export function notifyPullSuccess(showToast: ShowToast, result: string): void {
    const trimmed = result?.trim()
    showToast({
        type: 'success',
        title: 'Changes downloaded',
        detail: trimmed || undefined,
    })
}

export function notifyPullError(showToast: ShowToast, error: unknown): void {
    const gitError = error as GitError
    if (gitError?.type === 'conflict') {
        showToast({
            type: 'error',
            title: "Couldn't download changes",
            detail:
                'Your work overlaps with recent updates from your collaborators. Reach out to your team to sort it out.',
        })
    } else if (gitError?.type === 'network') {
        showToast({
            type: 'error',
            title: 'Connection failed',
            detail: 'Check your internet connection and try again.',
        })
    } else {
        showToast({
            type: 'error',
            title: "Couldn't download changes",
            detail: gitError?.message ?? detailFromUnknown(error),
        })
    }
}

export function notifyCommitSuccess(showToast: ShowToast, result: string): void {
    const trimmed = result?.trim()
    showToast({
        type: 'success',
        title: 'Snapshot saved',
        detail: trimmed ? `What changed:\n${trimmed}` : undefined,
    })
}

export function notifyCommitError(showToast: ShowToast, error: unknown): void {
    showToast({
        type: 'error',
        title: "Couldn't save snapshot",
        detail: detailFromUnknown(error),
    })
}

export function notifyPushSuccess(showToast: ShowToast, result: string): void {
    const trimmed = result?.trim()
    showToast({
        type: 'success',
        title: 'Changes uploaded',
        detail: trimmed || 'Your latest snapshot is on SoundHaus.',
    })
}

export function notifyPushError(showToast: ShowToast, error: unknown): void {
    showToast({
        type: 'error',
        title: 'Upload failed',
        detail: detailFromUnknown(error),
    })
}
