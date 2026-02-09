import { useState, useEffect } from "react"
import { Link, useLocation } from "react-router-dom"

export default function TopNav() {
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 20
      if (isScrolled !== scrolled) {
        setScrolled(isScrolled)
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [scrolled])

  return (
    <header className={`nav-container ${scrolled ? 'scrolled' : ''}`} role="banner">
      <div className="nav-wrapper">
        <Link to="/repos" className="nav-brand">SoundHaus</Link>

        <nav className="nav-links" role="navigation" aria-label="Main">
          <Link to="/repos" className={location.pathname.startsWith("/repos") ? "nav-link active" : "nav-link"}>
            Projects
          </Link>
          <Link to="/explore" className={location.pathname === "/explore" ? "nav-link active" : "nav-link"}>
            Explore
          </Link>
          <Link to="/" className={location.pathname === "/" ? "nav-link active" : "nav-link"}>
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  )
}