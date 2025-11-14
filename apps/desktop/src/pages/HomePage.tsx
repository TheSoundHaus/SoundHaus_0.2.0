import { useNavigate } from 'react-router-dom'

const HomePage = () => {
    const navigate = useNavigate()

    const handleServerExplore = async () => {
        window.open("http://www.rickleinecker.com/", "_blank");
    }
    
    const handleAbletonImport = async () => {
        navigate('/project')
    }

    const handleExistingProject = async () => {
        navigate('/project')
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