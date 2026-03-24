import React, { useEffect, useState } from 'react'
import type { RecentProject } from '../types/index'

interface OpenProjectDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelectProject: (projectPath: string) => Promise<void>
  onOpenFromFilepath: () => Promise<void>
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

  // Load recent projects when dialog opens
  useEffect(() => {
    if (!isOpen) return

    const loadProjects = async () => {
      try {
        const projects = await window.electron?.getRecentProjects()
        if (projects) {
          setRecentProjects(projects)
        }
      } catch (error) {
        console.error('Failed to load recent projects:', error)
      }
    }

    loadProjects()
    setSelectedPath(null)
  }, [isOpen])

  const handleSelectProject = (projectPath: string) => {
    setSelectedPath(projectPath)
  }

  const handleRemoveProject = async (e: React.MouseEvent, projectPath: string) => {
    e.stopPropagation()
    try {
      await window.electron?.removeRecentProject(projectPath)
      // Remove from local state
      setRecentProjects(recentProjects.filter(p => p.path !== projectPath))
      // Clear selection if this was the selected project
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
      await onSelectProject(selectedPath)
      onClose()
    } catch (error) {
      alert(`Failed to open project:\n${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenFromFilepath = async () => {
    setLoading(true)
    try {
      await onOpenFromFilepath()
      onClose()
    } catch (error) {
      console.warn('Filepath picker cancelled or failed')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>Open SoundHaus Project</h2>

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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  dialog: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    padding: '24px',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
  },
  title: {
    margin: '0 0 16px 0',
    fontSize: '20px',
    fontWeight: '600',
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
    color: '#666',
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
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  projectItemSelected: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196F3',
  },
  projectClickArea: {
    flex: 1,
    cursor: 'pointer',
    minWidth: 0,
  },
  projectName: {
    fontWeight: '500',
    marginBottom: '4px',
  },
  projectPath: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  projectDate: {
    fontSize: '11px',
    color: '#999',
  },
  removeButton: {
    marginLeft: '12px',
    padding: '4px 8px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#ffebee',
    color: '#c62828',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
    transition: 'all 0.2s',
    flexShrink: 0,
  },
  emptyState: {
    textAlign: 'center',
    color: '#999',
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
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: '#f5f5f5',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s',
  },
  buttonPrimary: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#2196F3',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s',
  },
  buttonSecondary: {
    padding: '8px 16px',
    border: '1px solid #2196F3',
    borderRadius: '4px',
    backgroundColor: 'white',
    color: '#2196F3',
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
