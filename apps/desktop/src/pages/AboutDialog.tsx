const AboutDialog = () => {
    return (
        <div style={{
            padding: '28px 32px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            boxSizing: 'border-box',
        }}>
            <h1 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: 700 }}>
                SoundHaus
            </h1>
            <p style={{ margin: '0 0 20px', fontSize: '12px', color: '#888' }}>
                Version 0.2.0
            </p>

            <p style={{ margin: '0 0 12px', fontSize: '14px', lineHeight: 1.6, color: '#333' }}>
                SoundHaus brings version control and collaboration to music
                production — without interrupting your flow. Save snapshots of
                your projects, share them with collaborators, and explore what
                other producers are working on, all from one place.
            </p>

            <div style={{ marginTop: 'auto' }}>
                <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600, color: '#555' }}>
                    Made by
                </p>
                <p style={{ margin: '0 0 24px', fontSize: '13px', lineHeight: 1.6, color: '#555' }}>
                    Wesley Chou, Rahul Ghosh, Nathan Hall, Jared Jones &amp; Jake Wright
                </p>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={() => window.close()}
                        style={{
                            padding: '8px 20px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            background: '#f5f5f5',
                            cursor: 'pointer',
                            fontSize: '14px',
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AboutDialog
