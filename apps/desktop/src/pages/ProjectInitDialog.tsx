import { useState } from 'react'
import { FolderPlus, Lock, Globe, X } from 'lucide-react'

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
        <div className="flex items-center justify-center w-full h-screen bg-bg-primary p-5">
            <div className="w-full max-w-md animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent/10">
                            <FolderPlus className="w-4.5 h-4.5 text-accent" />
                        </div>
                        <h2 className="text-lg font-semibold text-text-primary">New Project</h2>
                    </div>
                    <button
                        onClick={handleCancel}
                        className="flex items-center justify-center w-7 h-7 rounded-lg
                                   text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/60
                                   transition-all duration-200 cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Form Card */}
                <div className="glass-panel rounded-2xl p-5">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Project Name */}
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                                Project Name <span className="text-accent">*</span>
                            </label>
                            <input
                                type="text"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                className="w-full px-3.5 py-2.5 rounded-xl bg-bg-primary/60 border border-border-default text-text-primary text-sm
                                           placeholder:text-text-tertiary
                                           focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent
                                           transition-all duration-200"
                                placeholder="My Ableton Project"
                                autoFocus
                                required
                            />
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                                Description
                            </label>
                            <textarea
                                value={projectDescription}
                                onChange={(e) => setProjectDescription(e.target.value)}
                                className="w-full px-3.5 py-2.5 rounded-xl bg-bg-primary/60 border border-border-default text-text-primary text-sm
                                           placeholder:text-text-tertiary resize-y min-h-[80px] font-[inherit]
                                           focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent
                                           transition-all duration-200"
                                placeholder="Optional project description"
                            />
                        </div>

                        {/* Visibility Toggle */}
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">
                                Visibility
                            </label>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsPublic(false)}
                                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium
                                               border transition-all duration-200 cursor-pointer
                                               ${!isPublic
                                                   ? 'bg-accent/10 border-accent/30 text-accent'
                                                   : 'bg-bg-primary/40 border-border-default text-text-secondary hover:text-text-primary hover:border-border-default/80'
                                               }`}
                                >
                                    <Lock className="w-3.5 h-3.5" />
                                    Private
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsPublic(true)}
                                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium
                                               border transition-all duration-200 cursor-pointer
                                               ${isPublic
                                                   ? 'bg-accent/10 border-accent/30 text-accent'
                                                   : 'bg-bg-primary/40 border-border-default text-text-secondary hover:text-text-primary hover:border-border-default/80'
                                               }`}
                                >
                                    <Globe className="w-3.5 h-3.5" />
                                    Public
                                </button>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="flex-1 px-4 py-2.5 rounded-xl
                                           bg-bg-primary/40 border border-border-default
                                           text-sm font-medium text-text-secondary
                                           hover:text-text-primary hover:bg-bg-elevated
                                           active:scale-[0.97] transition-all duration-200 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!projectName.trim()}
                                className="flex-1 px-4 py-2.5 rounded-xl
                                           btn-brand
                                           text-sm
                                           disabled:opacity-40 disabled:cursor-not-allowed
                                           active:scale-[0.97] transition-all duration-200 cursor-pointer"
                            >
                                Create Project
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default ProjectInitDialog
