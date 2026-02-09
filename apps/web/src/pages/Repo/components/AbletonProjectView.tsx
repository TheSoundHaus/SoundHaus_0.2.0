import { useState } from 'react'
import './AbletonProjectView.css'
import './RepoViewer.css'
import type { ProjectMetadata } from '../../../lib/utils/abletonParser'

interface RepoContent {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  download_url?: string
  lfs?: boolean
}

interface AbletonProjectViewProps {
  repoName: string
  metadata: ProjectMetadata
  repoContents: RepoContent[]
  onBack: () => void
  // Watch folder props
  localPath: string
  setLocalPath: (path: string) => void
  watchBranch: string
  setWatchBranch: (branch: string) => void
  watchRepoPath: string
  setWatchRepoPath: (path: string) => void
  loadingPreferences: boolean
  startWatchSession: () => void
  showWatchModal: boolean
  createdSession: any
  closeWatchModal: () => void
  downloadScript: (type: 'bat' | 'ps1' | 'sh') => void
  // Collaborators props
  showCollaboratorsModal: boolean
  setShowCollaboratorsModal: (show: boolean) => void
  collaborators: any[]
  loadingCollaborators: boolean
  fetchCollaborators: () => void
  inviteEmail: string
  setInviteEmail: (email: string) => void
  invitePermission: string
  setInvitePermission: (permission: string) => void
  inviteCollaborator: () => void
  removeCollaborator: (username: string) => void
  // Upload props
  showUpload: boolean
  setShowUpload: (show: boolean) => void
  uploadFileName: string
  uploadMessage: string
  uploadContent: string
  uploading: boolean
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleFolderInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleFileUpload: (e: React.FormEvent) => void
  setUploadFileName: (name: string) => void
  setUploadMessage: (msg: string) => void
  setUploadContent: (content: string) => void
}

export default function AbletonProjectView(props: AbletonProjectViewProps) {
  const {
    repoName,
    metadata,
    repoContents,
    // onBack, // Not currently used
    // Watch folder
    localPath,
    setLocalPath,
    watchBranch,
    setWatchBranch,
    watchRepoPath,
    setWatchRepoPath,
    loadingPreferences,
    startWatchSession,
    showWatchModal,
    createdSession,
    closeWatchModal,
    downloadScript,
    // Collaborators
    showCollaboratorsModal,
    setShowCollaboratorsModal,
    collaborators,
    loadingCollaborators,
    fetchCollaborators,
    inviteEmail,
    setInviteEmail,
    invitePermission,
    setInvitePermission,
    inviteCollaborator,
    removeCollaborator,
    // Upload
    showUpload,
    setShowUpload,
    uploadFileName,
    uploadMessage,
    uploadContent,
    uploading,
    handleFileInputChange,
    handleFolderInputChange,
    handleFileUpload,
    setUploadFileName,
    setUploadMessage,
    setUploadContent,
  } = props

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [folderContents, setFolderContents] = useState<Map<string, RepoContent[]>>(new Map())
  // const [selectedTrack, setSelectedTrack] = useState<Track | null>(null) // Not currently used
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set())
  const [showWatchSettings, setShowWatchSettings] = useState(false)

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const toggleFolder = async (path: string) => {
    const newExpanded = new Set(expandedFolders)

    if (newExpanded.has(path)) {
      // Collapse folder
      newExpanded.delete(path)
      setExpandedFolders(newExpanded)
    } else {
      // Expand folder - fetch contents if not already loaded
      newExpanded.add(path)
      setExpandedFolders(newExpanded)

      if (!folderContents.has(path)) {
        // Fetch folder contents
        const token = localStorage.getItem('access_token') || ''
        if (!token) return

        const newLoadingFolders = new Set(loadingFolders)
        newLoadingFolders.add(path)
        setLoadingFolders(newLoadingFolders)

        try {
          const url = `${API_URL}/repos/${repoName}/contents?path=${encodeURIComponent(path)}`
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          })

          const data = await res.json()
          if (data.success) {
            const contents = Array.isArray(data.contents) ? data.contents : [data.contents]
            const newFolderContents = new Map(folderContents)
            newFolderContents.set(path, contents)
            setFolderContents(newFolderContents)
          }
        } catch (error) {
          console.error('[AbletonProjectView] Error fetching folder contents:', error)
        } finally {
          const newLoadingFolders = new Set(loadingFolders)
          newLoadingFolders.delete(path)
          setLoadingFolders(newLoadingFolders)
        }
      }
    }
  }

  const getFileIcon = (item: RepoContent) => {
    if (item.type === 'dir') return '📁'
    const ext = item.name.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'als': return '🎵'
      case 'wav':
      case 'mp3':
      case 'flac':
      case 'aif':
      case 'aiff': return '🎵'
      case 'mid':
      case 'midi': return '🎹'
      case 'txt':
      case 'md': return '📝'
      default: return '📄'
    }
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleDownloadFile = async (item: RepoContent) => {
    try {
      const token = localStorage.getItem('access_token') || ''
      if (!token) {
        console.error('No access token found')
        return
      }

      // Fetch the file content through our API which handles the Gitea auth
      const url = `${API_URL}/repos/${repoName}/contents?path=${encodeURIComponent(item.path)}`
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const data = await response.json()
      if (!data.success || !data.contents?.content) {
        console.error('Failed to get file content:', data)
        return
      }

      // Decode base64 content and create blob
      const binaryString = atob(data.contents.content)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const blob = new Blob([bytes])

      // Trigger download
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = item.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('Failed to download file:', error)
    }
  }

  const renderFileTree = (items: RepoContent[], level: number = 0) => {
    return items.map((item) => {
      const isExpanded = expandedFolders.has(item.path)
      const isLoading = loadingFolders.has(item.path)
      const children = folderContents.get(item.path)
      // const isAbletonFile = item.name.toLowerCase().endsWith('.als') // Not currently used

      return (
        <div key={item.path}>
          <div
            className={`tree-item ${item.type} ${isExpanded ? 'expanded' : ''}`}
            style={{ paddingLeft: `${level * 20 + 12}px` }}
          >
            <div
              className="tree-item-content"
              onClick={() => item.type === 'dir' && toggleFolder(item.path)}
            >
              <span className="tree-icon">
                {item.type === 'dir' ? (
                  isLoading ? '⏳' : isExpanded ? '📂' : '📁'
                ) : (
                  getFileIcon(item)
                )}
              </span>
              <span className="tree-name">{item.name}</span>
              {item.type === 'file' && <span className="tree-size">{formatFileSize(item.size)}</span>}
              {item.lfs && <span className="lfs-badge-small">LFS</span>}
            </div>
            {item.type === 'file' && (
              <div className="tree-item-actions">
                <button
                  className="tree-action-button download-button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDownloadFile(item)
                  }}
                  title="Download file"
                >
                  ⬇
                </button>
              </div>
            )}
          </div>
          {isExpanded && children && (
            <div className="tree-children">
              {renderFileTree(children, level + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div className="ableton-project-view">
      {/* Header */}
      <header className="project-header">
        <div>
          <h1>{repoName}</h1>
        </div>
      </header>

      {/* Watch Folder Settings */}
      {showWatchSettings && (
        <div style={{
          padding: '1.5rem',
          background: '#2d2d2d',
          border: '1px solid #404040',
          borderRadius: '8px',
          margin: '0 20px 1rem',
          position: 'relative'
        }}>
          <button
            onClick={() => setShowWatchSettings(false)}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'transparent',
              border: 'none',
              color: '#999',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0',
              lineHeight: 1
            }}
            title="Close"
          >
            ✕
          </button>

          <h3 style={{ marginTop: 0, color: '#e5e5e5' }}>Folder Watch Settings</h3>
          <p style={{ color: '#999', fontSize: '0.9rem' }}>
            Set up automatic syncing for this project. Your folder path will be saved for next time.
          </p>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label htmlFor="local-path" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#e5e5e5' }}>
              Local Folder Path {localPath && '✅'}
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="local-path"
                type="text"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="C:\Users\YourName\Music\MyProject"
                style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.9rem',
                  padding: '0.5rem',
                  background: '#1a1a1a',
                  border: '1px solid #404040',
                  color: '#e5e5e5',
                  borderRadius: '4px'
                }}
              />
              <button
                onClick={async () => {
                  try {
                    // @ts-ignore
                    const dirHandle = await window.showDirectoryPicker()
                    alert(`Selected: ${dirHandle.name}\n\nCopy the full path and paste it in the field.`)
                  } catch (e) {
                    if (e instanceof Error && e.name !== 'AbortError') {
                      alert('Folder picker not supported. Please type the path manually.')
                    }
                  }
                }}
                style={{
                  padding: '0.5rem 1rem',
                  whiteSpace: 'nowrap',
                  background: '#404040',
                  border: '1px solid #555',
                  color: '#e5e5e5',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Browse...
              </button>
            </div>
            <small style={{ color: '#999' }}>This path will be saved for this project</small>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="watch-branch" style={{ color: '#e5e5e5' }}>Branch</label>
              <input
                id="watch-branch"
                type="text"
                value={watchBranch}
                onChange={(e) => setWatchBranch(e.target.value)}
                placeholder="main"
                style={{
                  width: '100%',
                  background: '#1a1a1a',
                  border: '1px solid #404040',
                  color: '#e5e5e5',
                  padding: '0.5rem',
                  borderRadius: '4px'
                }}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="watch-repo-path" style={{ color: '#e5e5e5' }}>Project Path (optional)</label>
              <input
                id="watch-repo-path"
                type="text"
                value={watchRepoPath}
                onChange={(e) => setWatchRepoPath(e.target.value)}
                placeholder="e.g., projects/2025"
                style={{
                  width: '100%',
                  background: '#1a1a1a',
                  border: '1px solid #404040',
                  color: '#e5e5e5',
                  padding: '0.5rem',
                  borderRadius: '4px'
                }}
              />
            </div>
          </div>

          <button
            onClick={startWatchSession}
            disabled={!localPath || loadingPreferences}
            className="watch-button"
            style={{
              background: localPath ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#555',
              color: 'white',
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: localPath ? 'pointer' : 'not-allowed',
            }}
          >
            {loadingPreferences ? 'Loading...' : 'Start Watching'}
          </button>
        </div>
      )}

      {/* Main Layout: Sidebar + Main Content */}
      <div className="project-layout">
        {/* Sidebar - File Tree */}
        <aside className="project-sidebar">
          <section className="sidebar-card glass-panel">
            <div className="sidebar-heading">
              <h2>Project Files</h2>
              <p>Browse project structure and contents</p>
            </div>
            <div className="file-tree">
              {repoContents.length === 0 ? (
                <p className="empty-tree">No files found</p>
              ) : (
                renderFileTree(repoContents)
              )}
            </div>
          </section>
        </aside>

        {/* Main Content - Action Cards */}
        <main className="project-main">
          {/* Open in Ableton Card */}
          <section className="action-card glass-panel clickable" onClick={async () => {
            // Find .als file recursively in folder contents
            const findAlsFile = (items: RepoContent[]): RepoContent | null => {
              for (const item of items) {
                if (item.type === 'file' && item.name.toLowerCase().endsWith('.als')) {
                  return item
                }
              }
              return null
            }

            const alsFile = findAlsFile(repoContents)
            if (alsFile) {
              await handleDownloadFile(alsFile)
            } else {
              // Try to find in expanded folders
              for (const [, contents] of folderContents.entries()) {
                const file = findAlsFile(contents)
                if (file) {
                  await handleDownloadFile(file)
                  return
                }
              }
              console.warn('No .als file found in project')
            }
          }}>
            <div className="card-icon">🎵</div>
            <div className="card-content">
              <h3>Open in Ableton</h3>
              <p>Download and open the Ableton Live project file</p>
            </div>
            <div className="card-arrow">→</div>
          </section>

          {/* Watch Folder Card */}
          <section className="action-card glass-panel clickable" onClick={() => setShowWatchSettings(!showWatchSettings)}>
            <div className="card-icon">📁</div>
            <div className="card-content">
              <h3>Watch Folder</h3>
              <p>Set up automatic syncing for this project</p>
            </div>
            <div className="card-arrow">→</div>
          </section>

          {/* Collaborators Card */}
          <section className="action-card glass-panel clickable" onClick={() => {
            setShowCollaboratorsModal(true)
            fetchCollaborators()
          }}>
            <div className="card-icon">👥</div>
            <div className="card-content">
              <h3>Collaborators</h3>
              <p>Manage team access and permissions</p>
            </div>
            <div className="card-arrow">→</div>
          </section>

          {/* Upload File Card */}
          <section className="action-card glass-panel clickable" onClick={() => setShowUpload(!showUpload)}>
            <div className="card-icon">⬆️</div>
            <div className="card-content">
              <h3>Upload Files</h3>
              <p>Add new files or folders to this project</p>
            </div>
            <div className="card-arrow">→</div>
          </section>
        </main>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <>
          <div className="repo-modal-overlay" onClick={() => setShowUpload(false)} />
          <div className="upload-modal">
            <div className="modal-header">
              <h3>Upload Files</h3>
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="modal-close"
              >
                ✕
              </button>
            </div>
            <div className="modal-content">
              <div className="upload-options">
                <div className="upload-option">
                  <h4>Upload Single File</h4>
                  <p>Choose a file from your computer to upload</p>
                  <input
                    id="file-input"
                    type="file"
                    onChange={handleFileInputChange}
                    className="file-input-button"
                  />
                </div>
                <div className="upload-option">
                  <h4>Upload Folder</h4>
                  <p>Upload an entire folder with all its files</p>
                  <input
                    id="folder-input"
                    type="file"
                    onChange={handleFolderInputChange}
                    className="file-input-button"
                    {...{ webkitdirectory: "", directory: "" } as any}
                    multiple
                  />
                </div>
              </div>

              {uploadFileName && (
                <form onSubmit={handleFileUpload} className="upload-form">
                  <div className="upload-controls">
                    <div className="form-group">
                      <label htmlFor="file-name">File Name</label>
                      <input
                        id="file-name"
                        type="text"
                        value={uploadFileName}
                        onChange={(e) => setUploadFileName(e.target.value)}
                        placeholder="example.txt"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="commit-message">Commit Message</label>
                      <input
                        id="commit-message"
                        type="text"
                        value={uploadMessage}
                        onChange={(e) => setUploadMessage(e.target.value)}
                        placeholder="Add new file"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="file-content">Content Preview</label>
                      <textarea
                        id="file-content"
                        value={uploadContent}
                        onChange={(e) => setUploadContent(e.target.value)}
                        placeholder="File content will appear here..."
                        rows={12}
                        required
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={uploading} className="upload-submit-button">
                    {uploading ? 'Uploading...' : 'Upload File'}
                  </button>
                </form>
              )}

              {uploading && !uploadFileName && (
                <div className="uploading-message">
                  <p>Uploading files... Please wait.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Watch Script Download Modal */}
      {showWatchModal && createdSession && (
        <>
          <div className="repo-modal-overlay" onClick={closeWatchModal} />
          <div className="upload-modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Download Watch Script</h3>
              <button
                type="button"
                onClick={closeWatchModal}
                className="modal-close"
              >
                ✕
              </button>
            </div>
            <div className="modal-content">
              <div className="script-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  onClick={() => downloadScript('bat')}
                  style={{
                    background: 'linear-gradient(135deg, #a3e635 0%, #84cc16 100%)',
                    color: 'white',
                    padding: '1rem',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1.1rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Download for Windows (.bat)
                </button>
                <button
                  onClick={() => downloadScript('ps1')}
                  style={{
                    background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                    color: 'white',
                    padding: '1rem',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1.1rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  PowerShell (.ps1)
                </button>
                <button
                  onClick={() => downloadScript('sh')}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: 'white',
                    padding: '1rem',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1.1rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Unix/Mac (.sh)
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Collaborators Modal */}
      {showCollaboratorsModal && (
        <>
          <div
            className="repo-modal-overlay"
            onClick={() => setShowCollaboratorsModal(false)}
          />
          <div className="upload-modal" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Manage Collaborators</h3>
              <button
                onClick={() => setShowCollaboratorsModal(false)}
                className="modal-close"
              >
                ✕
              </button>
            </div>

            <div className="modal-content">
              {/* Invite Section */}
              <div className="collaborator-section">
                <h4 className="section-title">
                  Invite Collaborator
                </h4>
                <div className="upload-controls">
                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="collaborator@example.com"
                    />
                  </div>

                  <div className="form-group">
                    <label>Permission Level</label>
                    <select
                      value={invitePermission}
                      onChange={(e) => setInvitePermission(e.target.value)}
                      className="permission-select"
                    >
                      <option value="read">Read Only</option>
                      <option value="write">Read & Write</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>

                  <button
                    onClick={inviteCollaborator}
                    className="upload-submit-button"
                  >
                    Send Invitation
                  </button>
                </div>
              </div>

              {/* Current Collaborators */}
              <div className="collaborator-section">
                <h4 className="section-title">
                  Current Collaborators
                </h4>
                {loadingCollaborators ? (
                  <p className="loading-state">Loading...</p>
                ) : collaborators.length === 0 ? (
                  <p className="loading-state">
                    No collaborators yet
                  </p>
                ) : (
                  <div className="collaborator-list">
                    {collaborators.map((collab) => (
                      <div key={collab.login} className="collaborator-item">
                        <div>
                          <div className="collaborator-name">
                            {collab.login}
                          </div>
                          <div className="collaborator-role">
                            {collab.permissions?.admin
                              ? 'Admin'
                              : collab.permissions?.push
                              ? 'Write'
                              : 'Read'}
                          </div>
                        </div>
                        <button
                          onClick={() => removeCollaborator(collab.login)}
                          className="remove-button"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
