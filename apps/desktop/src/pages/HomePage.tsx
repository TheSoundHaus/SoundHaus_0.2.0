import { useProjectActions } from '../hooks/useProjectActions'

const HomePage = () => {
    const { handleProjectClone, handleServerExplore, handleAbletonImport, handleExistingProject } = useProjectActions()

    return(
        <div>
            <h1>Let's get started!</h1>
            <p>Add a SoundHaus project to get started</p>

            <div>
                <button onClick={handleProjectClone}>Clone Ableton Project</button>
                <button onClick={handleServerExplore}>Explore projects from server</button>
                <button onClick={handleAbletonImport}>Import Ableton project</button>
                <button onClick={handleExistingProject}>Open existing SoundHaus project</button>
            </div>
        </div>
    )
}

export default HomePage;