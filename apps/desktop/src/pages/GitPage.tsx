import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import './GitPage.css'
import storageService from '../services/storageService'
import { useGitStatus } from '../hooks/useGitStatus'
import { useAlsParser } from '../hooks/useAlsParser'
import gitService from '../services/gitService'
import type { Project } from '../types'

function GitPage() {
  const location = useLocation()
  const initialPath = (location.state as any)?.projectPath || null

  const [projects] = useState<Project[]>(() => storageService.getRecentProjects())
  const [selectedProject, setSelectedProject] = useState<string | null>(initialPath)
  const [selectedVersion, setSelectedVersion] = useState('1.0')
  const [pulling, setPulling] = useState(false)
  const [pushing, setPushing] = useState(false)

  const { status, loading, formatStatus, refresh } = useGitStatus(selectedProject, true, 10000)
  const { metadata, findAndParse } = useAlsParser()

  useEffect(() => {
    if (selectedProject) {
      const version = storageService.getRepoVersion(selectedProject)
      setSelectedVersion(version)
      findAndParse(selectedProject)
    }
  }, [selectedProject, findAndParse])

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const path = e.target.value
    setSelectedProject(path || null)
  }

  const handleVersionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const version = e.target.value
    setSelectedVersion(version)
    if (selectedProject) {
      storageService.setRepoVersion(selectedProject, version)
    }
  }

  const handlePull = async () => {
    if (!selectedProject) return
    setPulling(true)
    try {
      const result = await gitService.pull(selectedProject)
      alert(`Pull complete:\n${result}`)
      refresh()
    } catch (error) {
      alert(`Pull failed: ${error}`)
    } finally {
      setPulling(false)
    }
  }

  const handlePush = async () => {
    if (!selectedProject) return
    setPushing(true)
    try {
      const result = await gitService.push(selectedProject)
      alert(`Push complete:\n${result}`)
      refresh()
    } catch (error) {
      alert(`Push failed: ${error}`)
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="git-page">
      <div className="git-header">
        <div className="header-controls">
          <div className="control-group">
            <label htmlFor="project-select">Current Repository</label>
            <select
              id="project-select"
              value={selectedProject || ''}
              onChange={handleProjectChange}
            >
              <option value="">No project</option>
              {projects.map(project => (
                <option key={project.path} value={project.path}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="version-select">Current Version</label>
            <select
              id="version-select"
              value={selectedVersion}
              onChange={handleVersionChange}
            >
              {storageService.getAvailableVersions().map(version => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="git-content">
        <div className="git-column">
          <h3>Local Changes</h3>

          <div className="status-summary">
            {loading ? 'Loading...' : formatStatus}
          </div>

          {status && status.hasChanges && (
            <div className="changes-list">
              {status.modified.length > 0 && (
                <div className="change-group">
                  <h4>Modified ({status.modified.length})</h4>
                  {status.modified.map(file => (
                    <div key={file} className="file-item modified">{file}</div>
                  ))}
                </div>
              )}
              {status.added.length > 0 && (
                <div className="change-group">
                  <h4>Added ({status.added.length})</h4>
                  {status.added.map(file => (
                    <div key={file} className="file-item added">{file}</div>
                  ))}
                </div>
              )}
              {status.deleted.length > 0 && (
                <div className="change-group">
                  <h4>Deleted ({status.deleted.length})</h4>
                  {status.deleted.map(file => (
                    <div key={file} className="file-item deleted">{file}</div>
                  ))}
                </div>
              )}
              {status.untracked.length > 0 && (
                <div className="change-group">
                  <h4>Untracked ({status.untracked.length})</h4>
                  {status.untracked.map(file => (
                    <div key={file} className="file-item untracked">{file}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="git-actions">
            <button
              className="git-button"
              onClick={handlePull}
              disabled={!selectedProject || pulling}
            >
              {pulling ? 'Pulling...' : 'Pull'}
            </button>
            <button
              className="git-button primary"
              onClick={handlePush}
              disabled={!selectedProject || pushing || !status?.hasChanges}
            >
              {pushing ? 'Pushing...' : 'Push'}
            </button>
          </div>
        </div>

        <div className="als-column">
          <h3>ALS File Content</h3>

          {metadata ? (
            <div className="als-info">
              {metadata.version && (
                <div className="info-row">
                  <span className="label">Ableton Version:</span>
                  <span className="value">{metadata.version}</span>
                </div>
              )}
              {metadata.creator && (
                <div className="info-row">
                  <span className="label">Creator:</span>
                  <span className="value">{metadata.creator}</span>
                </div>
              )}
              {metadata.tempo && (
                <div className="info-row">
                  <span className="label">Tempo:</span>
                  <span className="value">{metadata.tempo} BPM</span>
                </div>
              )}
              {metadata.tracks && (
                <div className="info-section">
                  <h4>Tracks</h4>
                  <div className="info-row">
                    <span className="label">MIDI:</span>
                    <span className="value">{metadata.tracks.midi}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Audio:</span>
                    <span className="value">{metadata.tracks.audio}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Return:</span>
                    <span className="value">{metadata.tracks.return}</span>
                  </div>
                </div>
              )}
              {metadata.samples && metadata.samples.length > 0 && (
                <div className="info-section">
                  <h4>Samples ({metadata.samples.length})</h4>
                  <div className="samples-list">
                    {metadata.samples.slice(0, 10).map((sample, idx) => (
                      <div key={idx} className="sample-item">
                        <div className="sample-path">{sample.path}</div>
                        <div className="sample-count">× {sample.count}</div>
                      </div>
                    ))}
                    {metadata.samples.length > 10 && (
                      <div className="sample-more">
                        + {metadata.samples.length - 10} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="als-placeholder">
              {selectedProject
                ? 'No .als file found in project'
                : 'Select a project to view ALS content'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GitPage
