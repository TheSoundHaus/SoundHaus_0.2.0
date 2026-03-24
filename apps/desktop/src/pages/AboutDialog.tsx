import { useEffect } from 'react'

const AboutDialog = () => {
    useEffect(() => {
        const root = document.getElementById('root')

        const previousBodyStyles = {
            margin: document.body.style.margin,
            minHeight: document.body.style.minHeight,
            display: document.body.style.display,
            placeItems: document.body.style.placeItems,
            overflow: document.body.style.overflow,
        }

        const previousRootStyles = root
            ? {
                maxWidth: root.style.maxWidth,
                margin: root.style.margin,
                padding: root.style.padding,
                textAlign: root.style.textAlign,
                height: root.style.height,
            }
            : null

        // Neutralize global starter CSS so modal content can fit exactly.
        document.body.style.margin = '0'
        document.body.style.minHeight = '0'
        document.body.style.display = 'block'
        document.body.style.placeItems = 'normal'
        document.body.style.overflow = 'hidden'

        if (root) {
            root.style.maxWidth = 'none'
            root.style.margin = '0'
            root.style.padding = '0'
            root.style.textAlign = 'left'
            root.style.height = '100vh'
        }

        return () => {
            document.body.style.margin = previousBodyStyles.margin
            document.body.style.minHeight = previousBodyStyles.minHeight
            document.body.style.display = previousBodyStyles.display
            document.body.style.placeItems = previousBodyStyles.placeItems
            document.body.style.overflow = previousBodyStyles.overflow

            if (root && previousRootStyles) {
                root.style.maxWidth = previousRootStyles.maxWidth
                root.style.margin = previousRootStyles.margin
                root.style.padding = previousRootStyles.padding
                root.style.textAlign = previousRootStyles.textAlign
                root.style.height = previousRootStyles.height
            }
        }
    }, [])

    return (
        <div style={{
            padding: '28px 32px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
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

            <div>
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
