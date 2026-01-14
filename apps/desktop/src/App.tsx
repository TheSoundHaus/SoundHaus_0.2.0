import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import './App.css'
import MainPage from './pages/MainPage'
import GitPage from './pages/GitPage'
import WebAppPage from './pages/WebAppPage'

function TabNavigation() {
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="tab-nav">
      <Link
        to="/"
        className={`tab-link ${isActive('/') ? 'active' : ''}`}
      >
        Main
      </Link>
      <Link
        to="/git"
        className={`tab-link ${isActive('/git') ? 'active' : ''}`}
      >
        Git
      </Link>
      <Link
        to="/webapp"
        className={`tab-link ${isActive('/webapp') ? 'active' : ''}`}
      >
        Web App
      </Link>
    </div>
  )
}

function App() {
  return (
    <Router>
      <div className="app">
        <TabNavigation />
        <div className="app-content">
          <Routes>
            <Route path="/" element={<MainPage />} />
            <Route path="/git" element={<GitPage />} />
            <Route path="/webapp" element={<WebAppPage />} />
          </Routes>
        </div>
      </div>
    </Router>
  )
}

export default App
