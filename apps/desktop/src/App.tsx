import { useState, useEffect } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import './App.css'

import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import ProjectPage from './pages/ProjectPage'
import ProjectInitDialog from './pages/ProjectInitDialog'
import CloneUrlDialog from './pages/CloneUrlDialog'
import SearchPalette from './components/SearchPalette'
import { useMenuActions } from './hooks/useMenuActions'

function MenuActionListener() {
  useMenuActions();
  return null;
}

function App() {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)

  useEffect(() => {
    const handleOpen = () => setIsPaletteOpen(true)
    window.addEventListener('soundhaus:open-search-palette', handleOpen)
    return () => window.removeEventListener('soundhaus:open-search-palette', handleOpen)
  }, [])

  return (
    <Router>
      <MenuActionListener />
      <SearchPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/project" element={<ProjectPage />} />
        <Route path="/project-setup" element={<ProjectInitDialog />} />
        <Route path="/clone-url" element={<CloneUrlDialog />} />
      </Routes>
    </Router>
  )
}

export default App
