import { useNavigate } from 'react-router-dom'
import { useElectronIPC } from '../hooks/useElectronIPC'

const HomePage = () => {
    const { chooseFolder, hasGitFile, initRepo } = useElectronIPC()
    const navigate = useNavigate()

    const handleServerExplore = async () => {
        window.open("http://www.rickleinecker.com/", "_blank");
    }

    const handleAbletonImport = async () => {
        const folder = await chooseFolder();
        if(folder) {
            try {
                const result = await initRepo(folder);
                alert(`Init complete:\n${result}`)
            } catch(error) {
                alert(`Init failed:\n${error}`)
            }

            // Backup check
            const git = await hasGitFile(folder);
            if(git) {
                navigate('/project', {state: {projectPath: folder}});
            }
        }
    }

    const handleExistingProject = async () => {
        const folder = await chooseFolder();
        if(folder) {
            const git = await hasGitFile(folder);
            if(git) {
                navigate('/project', {state: {projectPath: folder}});
            }
        }
    }

    return(
        <div>
            <h1>Let's get started!</h1>
            <p>Add a SoundHaus project to get started</p>

            <div>
                <button onClick={handleServerExplore}>Explore projects from server</button>
                <button onClick={handleAbletonImport}>Import Ableton project</button>
                <button onClick={handleExistingProject}>Open existing SoundHaus project</button>
            </div>
        </div>
    )
}

export default HomePage;