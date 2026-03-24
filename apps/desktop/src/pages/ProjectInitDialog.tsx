import { useState } from 'react'
import { Lock, Globe, FolderPlus, X } from 'lucide-react'

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

        window.electron?.submitProjectSetup(data)
    }

    const handleCancel = () => {
        window.electron?.cancelProjectSetup()
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-5">
            <div className="card-glass w-full max-w-md animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-glass-blue/10 flex items-center justify-center">
                            <FolderPlus className="w-4 h-4 text-glass-blue" />
                        </div>
                        <h2 className="text-base font-semibold text-soft-white">New Project</h2>
                    </div>
                    <button
                        onClick={handleCancel}
                        className="p-1.5 rounded-btn hover:bg-white/5 transition-colors"
                    >
                        <X className="w-4 h-4 text-muted" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {/* Project Name */}
                    <div>
                        <label className="label">
                            Project Name <span className="text-glass-blue">*</span>
                        </label>
                        <input
                            type="text"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            className="input"
                            placeholder="my-ableton-project"
                            autoFocus
                            required
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="label">Description</label>
                        <textarea
                            value={projectDescription}
                            onChange={(e) => setProjectDescription(e.target.value)}
                            className="textarea"
                            placeholder="Describe your project (optional)"
                        />
                    </div>

                    {/* Visibility */}
                    <div>
                        <label className="label mb-3">Visibility</label>
                        <div className="flex flex-col gap-2">
                            <div
                                className="radio-card"
                                data-selected={!isPublic}
                                onClick={() => setIsPublic(false)}
                            >
                                <div className="radio-indicator">
                                    <div className="radio-dot" />
                                </div>
                                <Lock className="w-4 h-4 text-muted flex-shrink-0" />
                                <div>
                                    <div className="text-sm font-medium text-soft-white">Private</div>
                                    <div className="text-xs text-muted">Only you and collaborators can access</div>
                                </div>
                            </div>
                            <div
                                className="radio-card"
                                data-selected={isPublic}
                                onClick={() => setIsPublic(true)}
                            >
                                <div className="radio-indicator">
                                    <div className="radio-dot" />
                                </div>
                                <Globe className="w-4 h-4 text-muted flex-shrink-0" />
                                <div>
                                    <div className="text-sm font-medium text-soft-white">Public</div>
                                    <div className="text-xs text-muted">Anyone can discover and clone</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 justify-end mt-2">
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="btn btn-ghost"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!projectName.trim()}
                            className="btn btn-primary"
                        >
                            <FolderPlus className="w-4 h-4" />
                            Create Project
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default ProjectInitDialog
