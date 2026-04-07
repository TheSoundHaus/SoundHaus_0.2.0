import { Waves } from 'lucide-react'

const AboutDialog = () => {
    return (
        <div className="flex flex-col h-screen bg-bg-primary text-text-primary p-7 box-border">
            <div className="flex items-center gap-3 mb-1">
                <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent/10">
                    <Waves className="w-4.5 h-4.5 text-accent" />
                </div>
                <h1 className="text-xl font-bold text-gradient">SoundHaus</h1>
            </div>
            <p className="text-xs text-text-tertiary mb-5 ml-12">Version 0.2.0</p>

            <p className="text-sm text-text-secondary leading-relaxed mb-4">
                SoundHaus brings version control and collaboration to music
                production — without interrupting your flow. Save snapshots of
                your projects, share them with collaborators, and explore what
                other producers are working on, all from one place.
            </p>

            <div className="mt-auto">
                <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                    Made by
                </p>
                <p className="text-sm text-text-secondary leading-relaxed mb-6">
                    Wesley Chou, Rahul Ghosh, Nathan Hall, Jared Jones &amp; Jake Wright
                </p>

                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => window.close()}
                        className="px-5 py-2 rounded-lg text-sm font-medium
                                   bg-bg-elevated border border-border-default text-text-secondary
                                   hover:text-text-primary hover:border-accent/30
                                   transition-all duration-200 cursor-pointer"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AboutDialog
