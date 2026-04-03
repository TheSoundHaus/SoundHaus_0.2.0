import React, { useEffect, useRef, useState } from 'react'
import type { RecentProject } from '../types/index'

interface OpenProjectDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelectProject: (projectPath: string) => Promise<boolean>
  onOpenFromFilepath: () => Promise<boolean>
}

const OpenProjectDialog: React.FC<OpenProjectDialogProps> = ({
  isOpen,
  onClose,
  onSelectProject,
  onOpenFromFilepath,
}) => {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Load recent projects when dialog opens and manage focus
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

    // Focus dialog for keyboard accessibility
    dialogRef.current?.focus()
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, loading, onClose])

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
      console.error('Failed to remove project:', error)
    }
  }

  const handleOK = async () => {
    if (!selectedPath) return

    setLoading(true)
    try {
      const success = await onSelectProject(selectedPath)
      if (success) {
        onClose()
      }
    } catch (error) {
      alert(`Failed to open project:\n${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenFromFilepath = async () => {
    setLoading(true)
    try {
      const success = await onOpenFromFilepath()
      if (success) {
        onClose()
      }
    } catch (error) {
      console.warn('Filepath picker cancelled or failed')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-project-dialog-title"
        tabIndex={-1}
        style={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="open-project-dialog-title" style={styles.title}>Open SoundHaus Project</h2>

        {/* Recent Projects List */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Recent Projects</h3>
          {recentProjects.length === 0 ? (
            <p style={styles.emptyState}>No recent projects yet</p>
          ) : (
            <div style={styles.projectList}>
              {recentProjects.map((project) => (
                <div
                  key={project.path}
                  style={{
                    ...styles.projectItem,
                    ...(selectedPath === project.path ? styles.projectItemSelected : {}),
                  }}
                >
                  <div
                    style={styles.projectClickArea}
                    onClick={() => handleSelectProject(project.path)}
                  >
                    <div style={styles.projectName}>{project.name}</div>
                    <div style={styles.projectPath}>{project.path}</div>
                    <div style={styles.projectDate}>
                      Last opened: {new Date(project.lastOpened).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    style={styles.removeButton}
                    onClick={(e) => handleRemoveProject(e, project.path)}
                    title="Remove from recent projects"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div style={styles.actions}>
          <button
            style={styles.buttonSecondary}
            onClick={handleOpenFromFilepath}
            disabled={loading}
          >
            Open from Filepath
          </button>
          <div style={styles.spacer} />
          <button
            style={styles.buttonDefault}
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            style={{
              ...styles.buttonPrimary,
              ...(selectedPath === null ? styles.buttonDisabled : {}),
            }}
            onClick={handleOK}
            disabled={selectedPath === null || loading}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  dialog: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    backdropFilter: 'blur(24px)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    padding: '24px',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    color: '#F0F0F0',
  },
  title: {
    margin: '0 0 16px 0',
    fontSize: '20px',
    fontWeight: '600',
    color: '#F0F0F0',
  },
  section: {
    flex: 1,
    overflowY: 'auto',
    marginBottom: '16px',
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: '500',
    color: 'rgba(160, 160, 160, 0.6)',
  },
  projectList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  projectItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: 'rgba(255, 255, 255, 0.02)',
  },
  projectItemSelected: {
    backgroundColor: 'rgba(167, 199, 231, 0.09)',
    borderColor: 'rgba(167, 199, 231, 0.35)',
  },
  projectClickArea: {
    flex: 1,
    cursor: 'pointer',
    minWidth: 0,
  },
  projectName: {
    fontWeight: '500',
    marginBottom: '4px',
    color: '#F0F0F0',
  },
  projectPath: {
    fontSize: '12px',
    color: 'rgba(160, 160, 160, 0.6)',
    marginBottom: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  projectDate: {
    fontSize: '11px',
    color: 'rgba(120, 120, 120, 0.5)',
  },
  removeButton: {
    marginLeft: '12px',
    padding: '4px 8px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: '#EF4444',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
    transition: 'all 0.2s',
    flexShrink: 0,
  },
  emptyState: {
    textAlign: 'center',
    color: 'rgba(160, 160, 160, 0.6)',
    padding: '24px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  spacer: {
    flex: 1,
  },
  buttonDefault: {
    padding: '8px 16px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    color: '#F0F0F0',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s',
  },
  buttonPrimary: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#A7C7E7',
    color: '#111',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  buttonSecondary: {
    padding: '8px 16px',
    border: '1px solid rgba(167, 199, 231, 0.3)',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#A7C7E7',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
}

export default OpenProjectDialog
