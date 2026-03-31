import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useProjectActions } from '../hooks/useProjectActions'
import OpenProjectDialog from '../components/OpenProjectDialog'

const HomePage = () => {
    const location = useLocation()
    const navigate = useNavigate()
    const { 
        handleProjectClone, 
        handleServerExplore, 
        handleAbletonImport, 
        handleOpenSoundHausProject,
        handleSelectFromDialog,
        handleOpenFromFilepath,
        isOpenDialogVisible,
        setIsOpenDialogVisible,
    } = useProjectActions()

    // Open dialog if triggered from menu, then clear state to prevent re-opening on back
    useEffect(() => {
        if ((location.state as { openProjectDialog?: boolean })?.openProjectDialog) {
            setIsOpenDialogVisible(true)
            navigate(location.pathname, { replace: true, state: {} })
        }
    }, [location.state, navigate])

    return(
        <div>
            <h1>Let's get started!</h1>
            <p>Add a SoundHaus project to get started</p>

            <div>
                <button onClick={handleProjectClone}>Clone Ableton Project</button>
                <button onClick={handleServerExplore}>Explore projects from server</button>
                <button onClick={handleAbletonImport}>Import Ableton project</button>
                <button onClick={handleOpenSoundHausProject}>Open SoundHaus Project</button>
            </div>

            <OpenProjectDialog
                isOpen={isOpenDialogVisible}
                onClose={() => setIsOpenDialogVisible(false)}
                onSelectProject={handleSelectFromDialog}
                onOpenFromFilepath={handleOpenFromFilepath}
            />
        </div>
    )
}

export default HomePage;