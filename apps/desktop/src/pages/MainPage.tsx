import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './MainPage.css'
import { useElectronIPC } from '../hooks/useElectronIPC'
import storageService from '../services/storageService'
import type { Project } from '../types'

function MainPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState<'server' | 'ableton' | 'existing' | null>(null)
  const { chooseFolder, findAls } = useElectronIPC()
  const navigate = useNavigate()

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = () => {
    const recent = storageService.getRecentProjects()
    setProjects(recent)
  }

  const handleAddExisting = async () => {
    const folder = await chooseFolder()
    if (folder) {
      const alsFile = await findAls(folder)
      if (alsFile) {
        const projectName = folder.split('/').pop() || folder
        const project: Project = {
          name: projectName,
          path: folder,
          lastOpened: new Date()
        }
        storageService.addRecentProject(project)
        loadProjects()
        // Navigate to Git tab with this project
        navigate('/git', { state: { projectPath: folder } })
      } else {
        alert('No .als file found in the selected folder')
      }
    }
  }

  const handleCreateFromAbleton = async () => {
    const folder = await chooseFolder()
    if (folder) {
      const alsFile = await findAls(folder)
      if (alsFile) {
        const projectName = folder.split('/').pop() || folder
        const project: Project = {
          name: projectName,
          path: folder,
          lastOpened: new Date()
        }
        storageService.addRecentProject(project)
        loadProjects()
        navigate('/git', { state: { projectPath: folder } })
      } else {
        alert('No .als file found in the selected folder')
      }
    }
    setShowModal(false)
  }

  const handleCreateFromServer = () => {
    // Placeholder - will be implemented later with backend integration
    alert('Create from server feature coming soon!')
    setShowModal(false)
  }

  const handleProjectClick = (project: Project) => {
    // Update last opened
    const updated: Project = { ...project, lastOpened: new Date() }
    storageService.addRecentProject(updated)
    navigate('/git', { state: { projectPath: project.path } })
  }

  return (
    <div className="main-page">
      <div className="main-content">
        <h1>Let's get started!</h1>
        <p className="subtitle">Add a SoundHaus project to get started</p>

        <div className="action-buttons">
          <button
            className="action-button"
            onClick={() => { setModalType('server'); setShowModal(true) }}
          >
            Create from Server
          </button>
          <button
            className="action-button"
            onClick={handleCreateFromAbleton}
          >
            Create from Ableton Folder
          </button>
          <button
            className="action-button primary"
            onClick={handleAddExisting}
          >
            Open Existing Project
          </button>
        </div>

        {projects.length > 0 && (
          <div className="recent-projects">
            <h2>Recent Projects</h2>
            <div className="project-grid">
              {projects.map((project) => (
                <div
                  key={project.path}
                  className="project-card"
                  onClick={() => handleProjectClick(project)}
                >
                  <div className="project-icon">📁</div>
                  <div className="project-info">
                    <h3>{project.name}</h3>
                    <p className="project-path">{project.path}</p>
                    {project.lastOpened && (
                      <p className="project-date">
                        Last opened: {new Date(project.lastOpened).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <>
          <div className="modal-overlay" onClick={() => setShowModal(false)} />
          <div className="modal">
            <div className="modal-header">
              <h3>{modalType === 'server' ? 'Create from Server' : 'Create Project'}</h3>
              <button className="close-button" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-content">
              {modalType === 'server' && (
                <div>
                  <p>This feature will allow you to clone a project from the SoundHaus server.</p>
                  <button className="modal-action-button" onClick={handleCreateFromServer}>
                    Browse Server
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default MainPage
