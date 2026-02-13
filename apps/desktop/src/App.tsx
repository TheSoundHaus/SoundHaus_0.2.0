import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import './App.css'

import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import ProjectPage from './pages/ProjectPage'
import ProjectInitDialog from './pages/ProjectInitDialog'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/project" element={<ProjectPage />} />
        <Route path="/project-setup" element={<ProjectInitDialog />} />
      </Routes>
    </Router>
  )
}

export default App
