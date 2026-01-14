import './WebAppPage.css'

function WebAppPage() {
  return (
    <div className="webapp-page">
      <iframe
        src="http://localhost:5173"
        title="SoundHaus Web App"
        className="webapp-iframe"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  )
}

export default WebAppPage
