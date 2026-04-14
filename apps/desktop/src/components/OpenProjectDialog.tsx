import React, { useEffect, useRef, useState } from 'react'
import { FolderOpen, X, Clock, FolderSearch, Trash2, Cloud, ChevronLeft, Download } from 'lucide-react'
import type { OnlineRepoItem, RecentProject } from '../types/index'
import electronAPI from '../services/electronAPI'
import { useToast } from './ToastProvider'
import InvalidProjectNotice from './InvalidProjectNotice'
import type { InvalidProjectNoticeVariant } from './InvalidProjectNotice'

interface OpenProjectDialogProps {
  isOpen: boolean
  onClose: () => void
  /** Called only after the folder is confirmed to contain a SoundHaus (git) project. */
  onSelectProject: (projectPath: string) => Promise<boolean>
  /**
   * When provided, "Open from Filepath" will offer to bootstrap a folder that contains
   * an .als file but no git repo. The callback receives the folder path and should run
   * project setup + initRepo.
   */
  onSetupAbletonFolderAsSoundHaus?: (folderPath: string) => Promise<boolean>
  /** Opens the clone dialog with an optional pre-filled URL (online-only repos). */
  onCloneOnlineRepo?: (cloneUrl: string) => Promise<void>
}

const OpenProjectDialog: React.FC<OpenProjectDialogProps> = ({
  isOpen,
  onClose,
  onSelectProject,
  onSetupAbletonFolderAsSoundHaus,
  onCloneOnlineRepo,
}) => {
  const { showToast } = useToast()
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [invalidNotice, setInvalidNotice] = useState<{
    variant: InvalidProjectNoticeVariant
    path: string
  } | null>(null)
  const [onlinePanelOpen, setOnlinePanelOpen] = useState(false)
  const [onlineLoading, setOnlineLoading] = useState(false)
  const [onlineError, setOnlineError] = useState<string | null>(null)
  const [onlineItems, setOnlineItems] = useState<OnlineRepoItem[]>([])

  useEffect(() => {
    if (!isOpen) return

    const loadProjects = async () => {
      try {
        const projects = await window.electron?.getRecentProjects()
        if (projects) {
          setRecentProjects(projects as RecentProject[])
        }
      } catch (error) {
        console.error('Failed to load recent projects:', error)
      }
    }

    loadProjects()
    setSelectedPath(null)
    setInvalidNotice(null)
    dialogRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      setOnlinePanelOpen(false)
      setOnlineItems([])
      setOnlineError(null)
      setOnlineLoading(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (invalidNotice) return
      if (e.key === 'Escape' && !loading && !onlineLoading) {
        if (onlinePanelOpen) {
          setOnlinePanelOpen(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, loading, onlineLoading, onClose, invalidNotice, onlinePanelOpen])

  const handleSelectProject = (projectPath: string) => {
    setSelectedPath(projectPath)
  }

  const handleRemoveProject = async (e: React.MouseEvent, projectPath: string) => {
    e.stopPropagation()
    try {
      await window.electron?.removeRecentProject(projectPath)
      setRecentProjects(prev => prev.filter(p => p.path !== projectPath))
      if (selectedPath === projectPath) {
        setSelectedPath(null)
      }
    } catch (error) {
      console.error('Failed to remove recent project:', error)
    }
  }

  const dismissInvalidNotice = () => {
    setInvalidNotice(null)
  }

  const handleRemoveInvalidRecent = async () => {
    if (!invalidNotice || invalidNotice.variant !== 'recent') return
    try {
      await window.electron?.removeRecentProject(invalidNotice.path)
      setRecentProjects(prev => prev.filter(p => p.path !== invalidNotice.path))
      if (selectedPath === invalidNotice.path) {
        setSelectedPath(null)
      }
    } catch (error) {
      console.error('Failed to remove recent project:', error)
    }
    setInvalidNotice(null)
  }

  const handleOK = async () => {
    if (!selectedPath) return

    setLoading(true)
    try {
      const hasGit = await electronAPI.hasGitFile(selectedPath)
      if (!hasGit) {
        setInvalidNotice({ variant: 'recent', path: selectedPath })
        return
      }
      const success = await onSelectProject(selectedPath)
      if (success) {
        onClose()
      }
    } catch (error) {
      showToast({
        type: 'error',
        title: "Couldn't open project",
        detail: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleOpenFromFilepath = async () => {
    setLoading(true)
    try {
      const folder = await electronAPI.chooseFolder()
      if (!folder) return

      const hasGit = await electronAPI.hasGitFile(folder)
      if (!hasGit) {
        const alsPath = onSetupAbletonFolderAsSoundHaus
          ? await electronAPI.findAls(folder)
          : null
        setInvalidNotice({
          variant: alsPath ? 'filepath-ableton' : 'filepath',
          path: folder,
        })
        return
      }

      const success = await onSelectProject(folder)
      if (success) {
        onClose()
      }
    } catch {
      console.warn('Filepath picker cancelled or failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSetupAsSoundHaus = async () => {
    if (!invalidNotice || invalidNotice.variant !== 'filepath-ableton') return
    if (!onSetupAbletonFolderAsSoundHaus) return
    setLoading(true)
    try {
      const success = await onSetupAbletonFolderAsSoundHaus(invalidNotice.path)
      if (success) {
        setInvalidNotice(null)
        onClose()
      } else {
        setInvalidNotice(null)
      }
    } catch (error) {
      console.warn('Setup failed:', error)
      setInvalidNotice(null)
    } finally {
      setLoading(false)
    }
  }

  const loadOnlineRepos = async () => {
    setOnlineLoading(true)
    setOnlineError(null)
    try {
      const res = await window.electron?.getOwnedReposForOpenDialog()
      if (!res) {
        const msg = 'This action is only available in the SoundHaus app.'
        setOnlineError(msg)
        showToast({ type: 'error', title: 'Unavailable', detail: msg })
        return
      }
      if (!res.ok) {
        setOnlineError(res.error)
        showToast({
          type: 'error',
          title: 'Could not load online projects',
          detail: res.error,
        })
        return
      }
      setOnlineItems(res.items)
    } finally {
      setOnlineLoading(false)
    }
  }

  const handleOpenOnlinePanel = () => {
    setOnlinePanelOpen(true)
    setOnlineItems([])
    setOnlineError(null)
    void loadOnlineRepos()
  }

  const handleOpenInstalledFromOnline = async (localPath: string) => {
    setLoading(true)
    try {
      const hasGit = await electronAPI.hasGitFile(localPath)
      if (!hasGit) {
        showToast({
          type: 'error',
          title: "Couldn't open project",
          detail: 'This folder is no longer a valid git project.',
        })
        return
      }
      const success = await onSelectProject(localPath)
      if (success) {
        setOnlinePanelOpen(false)
        onClose()
      }
    } catch (error) {
      showToast({
        type: 'error',
        title: "Couldn't open project",
        detail: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCloneFromOnlineList = async (cloneUrl: string) => {
    if (!onCloneOnlineRepo) return
    setOnlinePanelOpen(false)
    await onCloneOnlineRepo(cloneUrl)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
      onClick={() => !invalidNotice && !onlinePanelOpen && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-project-dialog-title"
        tabIndex={-1}
        className="w-[560px] max-h-[80vh] glass-panel-heavy rounded-2xl flex flex-col animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10">
              <FolderOpen className="w-4 h-4 text-accent" />
            </div>
            <h2 id="open-project-dialog-title" className="text-base font-semibold text-text-primary">
              Open SoundHaus Project
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg
                       text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/60
                       transition-all duration-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Recent Projects List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Clock className="w-3.5 h-3.5 text-text-tertiary" />
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Recent Projects</h3>
          </div>

          {recentProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-xl bg-bg-elevated border border-border-subtle flex items-center justify-center mb-3">
                <FolderOpen className="w-5 h-5 text-text-tertiary" />
              </div>
              <p className="text-sm text-text-tertiary">No recent projects yet</p>
              <p className="text-xs text-text-tertiary/60 mt-1">Use "Open from Filepath" to find a project</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentProjects.map((project) => (
                <div
                  key={project.path}
                  className={`group flex items-center justify-between px-3 py-3 rounded-xl border
                    cursor-pointer transition-all duration-200
                    ${selectedPath === project.path
                      ? 'bg-accent/10 border-accent/30'
                      : 'bg-bg-primary/40 border-border-subtle hover:border-border-default hover:bg-bg-elevated'
                    }`}
                  onClick={() => handleSelectProject(project.path)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors duration-200
                      ${selectedPath === project.path ? 'bg-accent/15' : 'bg-bg-elevated group-hover:bg-bg-tertiary/60'}`}>
                      <FolderOpen className={`w-4 h-4 ${selectedPath === project.path ? 'text-accent' : 'text-text-tertiary'}`} />
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${selectedPath === project.path ? 'text-accent' : 'text-text-primary'}`}>
                        {project.name}
                      </div>
                      <div className="text-xs text-text-tertiary truncate mt-0.5">{project.path}</div>
                      <div className="text-xs text-text-tertiary/60 mt-0.5">
                        Last opened: {new Date(project.lastOpened).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleRemoveProject(e, project.path)}
                    title="Remove from recent projects"
                    className="ml-3 flex items-center justify-center w-7 h-7 rounded-lg shrink-0
                               text-text-tertiary hover:text-error hover:bg-error-soft
                               opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-t border-border-subtle">
          <button
            type="button"
            onClick={handleOpenFromFilepath}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                       bg-bg-elevated border border-border-default text-text-secondary
                       hover:text-text-primary hover:border-accent/30
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 cursor-pointer"
          >
            <FolderSearch className="w-4 h-4" />
            Open from Filepath
          </button>
          <button
            type="button"
            onClick={handleOpenOnlinePanel}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                       bg-bg-elevated border border-border-default text-text-secondary
                       hover:text-text-primary hover:border-accent/30
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 cursor-pointer"
          >
            <Cloud className="w-4 h-4" />
            Open Online Project
          </button>
          <div className="flex-1 min-w-[1rem]" />
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl text-sm font-medium
                       bg-bg-primary/40 border border-border-default text-text-secondary
                       hover:text-text-primary hover:bg-bg-elevated
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleOK}
            disabled={selectedPath === null || loading}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold
                       btn-brand
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all duration-200 cursor-pointer"
          >
            Open
          </button>
        </div>
      </div>

      {onlinePanelOpen && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
          onClick={() => !onlineLoading && setOnlinePanelOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="online-repos-title"
            className="w-[520px] max-h-[72vh] glass-panel-heavy rounded-2xl flex flex-col animate-scale-in overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
              <button
                type="button"
                onClick={() => !onlineLoading && setOnlinePanelOpen(false)}
                className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0
                           text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/60
                           disabled:opacity-50 transition-all duration-200 cursor-pointer"
                disabled={onlineLoading}
                aria-label="Back to recent projects"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 shrink-0">
                  <Cloud className="w-4 h-4 text-accent" />
                </div>
                <h2 id="online-repos-title" className="text-sm font-semibold text-text-primary truncate">
                  Your online projects
                </h2>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 min-h-[200px]">
              {onlineLoading && (
                <p className="text-sm text-text-tertiary text-center py-12">Loading…</p>
              )}
              {!onlineLoading && onlineError && (
                <p className="text-sm text-text-secondary text-center py-8 px-2">{onlineError}</p>
              )}
              {!onlineLoading && !onlineError && onlineItems.length === 0 && (
                <p className="text-sm text-text-tertiary text-center py-12">
                  You don&apos;t have any owned projects on the server yet.
                </p>
              )}
              {!onlineLoading && !onlineError && onlineItems.length > 0 && (
                <div className="space-y-2">
                  {onlineItems.map((item) => (
                    <div
                      key={item.fullName}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-3 rounded-xl border border-border-subtle bg-bg-primary/40"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">
                          {item.displayName}
                        </div>
                        <div className="text-xs text-text-tertiary truncate mt-0.5">{item.fullName}</div>
                        <div className="text-xs text-text-tertiary/70 mt-1">
                          {item.status === 'installed_locally'
                            ? 'Installed locally'
                            : 'Online only'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.status === 'installed_locally' && item.localPath && (
                          <button
                            type="button"
                            onClick={() => void handleOpenInstalledFromOnline(item.localPath as string)}
                            disabled={loading}
                            className="px-3 py-2 rounded-lg text-xs font-medium btn-brand
                                       disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Open
                          </button>
                        )}
                        {item.status === 'online_only' && onCloneOnlineRepo && (
                          <button
                            type="button"
                            onClick={() => void handleCloneFromOnlineList(item.cloneUrl)}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                                       bg-bg-elevated border border-border-default text-text-secondary
                                       hover:text-text-primary hover:border-accent/30
                                       disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Clone
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <InvalidProjectNotice
        open={invalidNotice !== null}
        variant={invalidNotice?.variant ?? 'filepath'}
        projectPath={invalidNotice?.path ?? ''}
        onDismiss={dismissInvalidNotice}
        onRemoveFromRecents={
          invalidNotice?.variant === 'recent' ? handleRemoveInvalidRecent : undefined
        }
        onSetupAsSoundHaus={
          invalidNotice?.variant === 'filepath-ableton' ? handleSetupAsSoundHaus : undefined
        }
      />
    </div>
  )
}

export default OpenProjectDialog
