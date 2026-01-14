import { useState } from 'react'

const ProjectInitDialog = () => {
    const [projectName, setProjectName] = useState('')
    const [projectDescription, setProjectDescription] = useState('')
    const [isPublic, setIsPublic] = useState(false)

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!projectName.trim()) return

        const data = {
            name: projectName.trim(),
            description: projectDescription.trim(),
            isPublic
        }

        // Send data back to main process
        window.electron?.submitProjectSetup(data)
    }

    const handleCancel = () => {
        window.electron?.cancelProjectSetup()
    }

    return (
        <div style={{ padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <h2 style={{ marginTop: 0 }}>Project Information</h2>
            
            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
                        Project Name *
                    </label>
                    <input
                        type="text"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px',
                            boxSizing: 'border-box',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            fontSize: '14px'
                        }}
                        placeholder="Enter project name"
                        autoFocus
                        required
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
                        Description
                    </label>
                    <textarea
                        value={projectDescription}
                        onChange={(e) => setProjectDescription(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px',
                            boxSizing: 'border-box',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            minHeight: '80px',
                            resize: 'vertical',
                            fontSize: '14px',
                            fontFamily: 'inherit'
                        }}
                        placeholder="Enter project description (optional)"
                    />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 500 }}>
                        Project Visibility
                    </label>
                    <div>
                        <label style={{ marginRight: '20px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                            <input
                                type="radio"
                                name="visibility"
                                checked={!isPublic}
                                onChange={() => setIsPublic(false)}
                                style={{ marginRight: '5px' }}
                            />
                            Private
                        </label>
                        <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                            <input
                                type="radio"
                                name="visibility"
                                checked={isPublic}
                                onChange={() => setIsPublic(true)}
                                style={{ marginRight: '5px' }}
                            />
                            Public
                        </label>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                    <button
                        type="button"
                        onClick={handleCancel}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            backgroundColor: 'white',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!projectName.trim()}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: projectName.trim() ? '#007bff' : '#ccc',
                            color: 'white',
                            cursor: projectName.trim() ? 'pointer' : 'not-allowed',
                            fontSize: '14px'
                        }}
                    >
                        Create Project
                    </button>
                </div>
            </form>
        </div>
    )
}

export default ProjectInitDialog
