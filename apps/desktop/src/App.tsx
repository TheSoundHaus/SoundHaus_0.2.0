import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'

import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import ProjectPage from './pages/ProjectPage'
import ProjectInitDialog from './pages/ProjectInitDialog'
import CloneUrlDialog from './pages/CloneUrlDialog'

/* Animated page wrapper — fades + slides each route in */
function AnimatedRoutes() {
  const location = useLocation()
  const [displayLocation, setDisplayLocation] = useState(location)
  const [transitionStage, setTransitionStage] = useState('animate-fade-in')

  useEffect(() => {
    if (location.pathname !== displayLocation.pathname) {
      setTransitionStage('opacity-0 translate-y-1')
      const timer = setTimeout(() => {
        setDisplayLocation(location)
        setTransitionStage('animate-fade-in')
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [location, displayLocation])

  return (
    <div className={`w-full h-full transition-all duration-300 ease-out ${transitionStage}`}>
      <Routes location={displayLocation}>
        <Route path="/" element={<LoginPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/project" element={<ProjectPage />} />
        <Route path="/project-setup" element={<ProjectInitDialog />} />
        <Route path="/clone-url" element={<CloneUrlDialog />} />
      </Routes>
    </div>
  )
}

function App() {
  return (
    <Router>
      <div className="w-full h-full bg-bg-primary text-text-primary overflow-hidden">
        <AnimatedRoutes />
      </div>
    </Router>
  )
}

export default App
