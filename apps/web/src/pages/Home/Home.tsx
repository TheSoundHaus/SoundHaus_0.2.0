import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import "./Home.css"

export default function HomePage() {
  const navigate = useNavigate()
  const user = useMemo(() => {
    try {
      const stored = localStorage.getItem("user")
      return stored ? JSON.parse(stored) : null
    } catch (error) {
      console.warn("[HomePage] Failed to parse stored user", error)
      return null
    }
  }, [])

  return (
    <div className="home-shell">
      <section className="home-hero">
        <div className="home-hero-body">
          <p className="home-kicker">Welcome back{user?.metadata?.name ? `, ${user.metadata.name}` : ""}</p>
          <h1 className="home-title">Shape sound together.</h1>
          <p className="home-subtitle">
            Spin up projects, invite collaborators, and keep every stem in sync across your
            SoundHaus workspace.
          </p>
          <div className="home-actions">
            <button className="button-primary" onClick={() => navigate("/repos")}>Open projects</button>
            <button className="button-ghost" onClick={() => navigate("/explore")}>Browse explore</button>
          </div>
        </div>
        <div className="home-hero-stats">
          <div className="stat-card">
            <span className="stat-value">∞</span>
            <span className="stat-label">Creative headroom</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">24/7</span>
            <span className="stat-label">Sync service</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">Secured</span>
            <span className="stat-label">Gitea backed</span>
          </div>
        </div>
      </section>

      <section className="home-panels">
        <article className="home-panel glass-panel">
          <h2>Next steps</h2>
          <ul className="panel-list">
            <li>
              <span>Create a new project to capture your latest session.</span>
              <button className="link-button arrow-button" onClick={() => navigate("/repos")}>Go</button>
            </li>
            <li>
              <span>Invite a collaborator to review stems and push new takes.</span>
              <button className="link-button arrow-button" onClick={() => navigate("/repos")}>Go</button>
            </li>
            <li>
              <span>Watch a local folder so fresh renders sync automatically.</span>
              <button className="link-button arrow-button" onClick={() => navigate("/repos")}>Go</button>
            </li>
          </ul>
        </article>

        <article className="home-panel glass-panel">
          <h2>Explore highlights</h2>
          <p className="panel-text">
            Discover curated projects, genre packs, and featured collaborators inside Explore.
          </p>
          <div className="panel-cta">
            <button className="button-secondary" onClick={() => navigate("/explore")}>Take me there</button>
            <span className="panel-hint">Fresh showcases drop every week.</span>
          </div>
        </article>

        <article className="home-panel glass-panel">
          <h2>Need a refresher?</h2>
          <p className="panel-text">
            Check the docs for set-up recipes, desktop watcher configuration, and CI tips.
          </p>
          <a className="button-link" href="https://docs.soundhaus.app" target="_blank" rel="noreferrer">
            Open documentation
          </a>
        </article>
      </section>
    </div>
  )
}
